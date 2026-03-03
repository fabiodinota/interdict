{{/*
Interdict iptables traffic redirect init container.

This init container sets up iptables NAT rules to transparently redirect
outbound traffic to AI vendor endpoints through the Interdict kernel proxy.

Only included when .Values.sidecar.trafficRedirect.enabled is true.
When disabled, use HTTP_PROXY/HTTPS_PROXY env vars on the app container instead.

Usage:
  initContainers:
    {{- if .Values.sidecar.trafficRedirect.enabled }}
    {{- include "interdict.sidecar.iptablesInit" . | nindent 4 }}
    {{- end }}
    {{- include "interdict.sidecar.container" . | nindent 4 }}
*/}}
{{- define "interdict.sidecar.iptablesInit" -}}
- name: interdict-iptables
  image: {{ include "interdict.image" (dict "service" .Values.kernel "global" .Values.global "chart" .Chart) }}
  imagePullPolicy: {{ .Values.kernel.image.pullPolicy }}
  command: ["/bin/sh", "-c"]
  args:
    - |
      # Redirect outbound HTTPS traffic to AI vendors through kernel proxy
      {{- if .Values.sidecar.trafficRedirect.targetHosts }}
      {{- range .Values.sidecar.trafficRedirect.targetHosts }}
      iptables -t nat -A OUTPUT -p tcp -d {{ . }} --dport 443 -j REDIRECT --to-port 8443
      {{- end }}
      {{- else if .Values.sidecar.allowlistVendors }}
      # Using sidecar.allowlistVendors list
      {{- range .Values.sidecar.allowlistVendors }}
      iptables -t nat -A OUTPUT -p tcp -d {{ . }} --dport 443 -j REDIRECT --to-port 8443
      {{- end }}
      {{- else }}
      # Default AI vendor endpoints
      iptables -t nat -A OUTPUT -p tcp -d api.openai.com --dport 443 -j REDIRECT --to-port 8443
      iptables -t nat -A OUTPUT -p tcp -d api.anthropic.com --dport 443 -j REDIRECT --to-port 8443
      {{- end }}
      echo "iptables traffic redirect configured"
  securityContext:
    capabilities:
      add: ["NET_ADMIN"]
    runAsUser: 0
  restartPolicy: Never  # Not a sidecar -- runs once during init
{{- end }}
