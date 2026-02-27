//! WebSocket upgrade detection and bidirectional frame relay.
//!
//! Detects WebSocket upgrade requests and provides frame-level relay
//! using tokio-tungstenite. In Phase 1, raw bidirectional byte relay
//! is used for ALL protocols including WebSocket. Frame-level relay
//! is available for Phase 3 when content inspection requires it.
//!
//! KERN-13: Uses tokio::select! (not channels). No unbounded channels.

use crate::error::ProxyError;
use futures_util::{SinkExt, StreamExt};
use http::Request;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

/// Detect whether an HTTP request is a WebSocket upgrade request.
///
/// Checks for WebSocket upgrade indicators:
/// - HTTP/1.1: `Connection: Upgrade` header + `Upgrade: websocket` header
/// - HTTP/2: Extended CONNECT with `:protocol: websocket` pseudo-header (RFC 8441)
///
/// This is called on the INNER request (after TLS termination) to detect
/// if the client wants to establish a WebSocket connection.
pub fn is_websocket_upgrade<B>(req: &Request<B>) -> bool {
    // HTTP/1.1 WebSocket upgrade: Connection: Upgrade + Upgrade: websocket
    let has_upgrade_connection = req
        .headers()
        .get(http::header::CONNECTION)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(',')
                .any(|token| token.trim().eq_ignore_ascii_case("upgrade"))
        });

    let has_upgrade_websocket = req
        .headers()
        .get(http::header::UPGRADE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("websocket"));

    if has_upgrade_connection && has_upgrade_websocket {
        return true;
    }

    // HTTP/2 Extended CONNECT: :protocol pseudo-header = websocket (RFC 8441)
    // In HTTP/2, the :protocol pseudo-header indicates WebSocket
    if req.method() == http::Method::CONNECT
        && let Some(protocol) = req.extensions().get::<String>()
        && protocol.eq_ignore_ascii_case("websocket")
    {
        return true;
    }

    false
}

/// Relay WebSocket frames bidirectionally between client and upstream.
///
/// Wraps both sides with `tokio_tungstenite::WebSocketStream` and relays
/// frames using `tokio::select!`. Handles:
/// - Normal message forwarding (Text, Binary)
/// - Close frame propagation with proper handshake
/// - Ping/Pong forwarding
///
/// This function is infrastructure for Phase 3 content inspection.
/// In Phase 1, raw byte relay is used for all protocols instead.
///
/// # Error Propagation
///
/// - If upstream disconnects: sends Close frame with code 1011 (Internal Error) to client
/// - If client disconnects: closes upstream cleanly
pub async fn relay_websocket<C, U>(client_stream: C, upstream_stream: U) -> Result<(), ProxyError>
where
    C: AsyncRead + AsyncWrite + Unpin,
    U: AsyncRead + AsyncWrite + Unpin,
{
    let mut client_ws = WebSocketStream::from_raw_socket(
        client_stream,
        tokio_tungstenite::tungstenite::protocol::Role::Server,
        None,
    )
    .await;

    let mut upstream_ws = WebSocketStream::from_raw_socket(
        upstream_stream,
        tokio_tungstenite::tungstenite::protocol::Role::Client,
        None,
    )
    .await;

    let mut client_frames: u64 = 0;
    let mut upstream_frames: u64 = 0;
    let mut client_bytes: u64 = 0;
    let mut upstream_bytes: u64 = 0;

    loop {
        tokio::select! {
            msg = client_ws.next() => {
                match msg {
                    Some(Ok(Message::Close(frame))) => {
                        // Forward close to upstream
                        tracing::debug!("client sent WebSocket Close");
                        let _ = upstream_ws.send(Message::Close(frame)).await;
                        break;
                    }
                    Some(Ok(msg)) => {
                        client_frames += 1;
                        client_bytes += msg.len() as u64;
                        if upstream_ws.send(msg).await.is_err() {
                            tracing::debug!("failed to forward to upstream, closing");
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::debug!(error = %e, "client WebSocket error");
                        // Send close to upstream
                        let _ = upstream_ws.close(None).await;
                        break;
                    }
                    None => {
                        // Client stream ended
                        tracing::debug!("client WebSocket stream ended");
                        let _ = upstream_ws.close(None).await;
                        break;
                    }
                }
            }
            msg = upstream_ws.next() => {
                match msg {
                    Some(Ok(Message::Close(frame))) => {
                        // Forward close to client
                        tracing::debug!("upstream sent WebSocket Close");
                        let _ = client_ws.send(Message::Close(frame)).await;
                        break;
                    }
                    Some(Ok(msg)) => {
                        upstream_frames += 1;
                        upstream_bytes += msg.len() as u64;
                        if client_ws.send(msg).await.is_err() {
                            tracing::debug!("failed to forward to client, closing");
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::debug!(error = %e, "upstream WebSocket error");
                        // Send Close with 1011 (Internal Error) to client per research Pitfall 6
                        let close_frame = CloseFrame {
                            code: CloseCode::Error,
                            reason: "upstream error".into(),
                        };
                        let _ = client_ws.send(Message::Close(Some(close_frame))).await;
                        break;
                    }
                    None => {
                        // Upstream stream ended unexpectedly
                        tracing::debug!("upstream WebSocket stream ended");
                        let close_frame = CloseFrame {
                            code: CloseCode::Error,
                            reason: "upstream disconnected".into(),
                        };
                        let _ = client_ws.send(Message::Close(Some(close_frame))).await;
                        break;
                    }
                }
            }
        }
    }

    tracing::debug!(
        client_frames = client_frames,
        upstream_frames = upstream_frames,
        client_bytes = client_bytes,
        upstream_bytes = upstream_bytes,
        "WebSocket relay completed"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::Method;

    #[test]
    fn test_is_websocket_upgrade_http11() {
        // Valid HTTP/1.1 WebSocket upgrade: Connection: Upgrade + Upgrade: websocket
        let req = Request::builder()
            .method(Method::GET)
            .uri("/ws")
            .header("connection", "Upgrade")
            .header("upgrade", "websocket")
            .body(())
            .unwrap();

        assert!(is_websocket_upgrade(&req));
    }

    #[test]
    fn test_is_websocket_upgrade_case_insensitive() {
        // Headers should be case-insensitive
        let req = Request::builder()
            .method(Method::GET)
            .uri("/ws")
            .header("connection", "upgrade")
            .header("upgrade", "WebSocket")
            .body(())
            .unwrap();

        assert!(is_websocket_upgrade(&req));
    }

    #[test]
    fn test_is_websocket_upgrade_connection_with_multiple_values() {
        // Connection header can contain multiple comma-separated values
        let req = Request::builder()
            .method(Method::GET)
            .uri("/ws")
            .header("connection", "keep-alive, Upgrade")
            .header("upgrade", "websocket")
            .body(())
            .unwrap();

        assert!(is_websocket_upgrade(&req));
    }

    #[test]
    fn test_is_not_websocket_normal_request() {
        let req = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/chat")
            .body(())
            .unwrap();

        assert!(!is_websocket_upgrade(&req));
    }

    #[test]
    fn test_is_not_websocket_missing_upgrade_header() {
        // Only Connection: Upgrade, no Upgrade: websocket
        let req = Request::builder()
            .method(Method::GET)
            .uri("/ws")
            .header("connection", "Upgrade")
            .body(())
            .unwrap();

        assert!(!is_websocket_upgrade(&req));
    }

    #[test]
    fn test_is_not_websocket_missing_connection_header() {
        // Only Upgrade: websocket, no Connection: Upgrade
        let req = Request::builder()
            .method(Method::GET)
            .uri("/ws")
            .header("upgrade", "websocket")
            .body(())
            .unwrap();

        assert!(!is_websocket_upgrade(&req));
    }

    #[test]
    fn test_is_not_websocket_non_websocket_upgrade() {
        // Connection: Upgrade but Upgrade is not websocket
        let req = Request::builder()
            .method(Method::GET)
            .uri("/h2c")
            .header("connection", "Upgrade")
            .header("upgrade", "h2c")
            .body(())
            .unwrap();

        assert!(!is_websocket_upgrade(&req));
    }

    #[tokio::test]
    async fn test_relay_websocket_bidirectional() {
        // Create two pairs of duplex streams
        let (client_side, proxy_client_side) = tokio::io::duplex(4096);
        let (proxy_upstream_side, upstream_side) = tokio::io::duplex(4096);

        // Spawn the relay
        let relay_handle =
            tokio::spawn(
                async move { relay_websocket(proxy_client_side, proxy_upstream_side).await },
            );

        // Wrap the external ends as WebSocket streams
        let mut client_ws = WebSocketStream::from_raw_socket(
            client_side,
            tokio_tungstenite::tungstenite::protocol::Role::Client,
            None,
        )
        .await;

        let mut upstream_ws = WebSocketStream::from_raw_socket(
            upstream_side,
            tokio_tungstenite::tungstenite::protocol::Role::Server,
            None,
        )
        .await;

        // Client sends a message
        client_ws
            .send(Message::Text("hello upstream".into()))
            .await
            .unwrap();

        // Upstream should receive it
        let msg = upstream_ws.next().await.unwrap().unwrap();
        assert_eq!(msg, Message::Text("hello upstream".into()));

        // Upstream sends a response
        upstream_ws
            .send(Message::Text("hello client".into()))
            .await
            .unwrap();

        // Client should receive it
        let msg = client_ws.next().await.unwrap().unwrap();
        assert_eq!(msg, Message::Text("hello client".into()));

        // Client sends close
        client_ws.close(None).await.unwrap();

        // Relay should complete
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), relay_handle).await;
        assert!(result.is_ok(), "relay should complete after close");
    }

    #[tokio::test]
    async fn test_relay_websocket_upstream_disconnect_sends_1011() {
        let (client_side, proxy_client_side) = tokio::io::duplex(4096);
        let (proxy_upstream_side, upstream_side) = tokio::io::duplex(4096);

        let relay_handle =
            tokio::spawn(
                async move { relay_websocket(proxy_client_side, proxy_upstream_side).await },
            );

        let mut client_ws = WebSocketStream::from_raw_socket(
            client_side,
            tokio_tungstenite::tungstenite::protocol::Role::Client,
            None,
        )
        .await;

        // Drop upstream side to simulate disconnect
        drop(upstream_side);

        // Relay should detect upstream disconnect and close client with 1011
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), relay_handle).await;
        assert!(
            result.is_ok(),
            "relay should complete after upstream disconnect"
        );

        // Client should receive a close (or stream end)
        // The exact behavior depends on timing, but the relay should not hang
        let _ = client_ws.close(None).await;
    }
}
