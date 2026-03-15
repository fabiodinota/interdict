{{/*
Interdict kernel sidecar container template (KEP-753 native sidecar pattern).

Usage: Include this in your pod's initContainers list to run the Interdict
kernel as a native sidecar that starts before and outlives the main container.

Example:
  initContainers:
    {{- include "interdict.sidecar.container" . | nindent 4 }}
  containers:
    - name: my-app
      ...
  volumes:
    - name: interdict-certs
      persistentVolumeClaim:
        claimName: {{ include "interdict.fullname" . }}-certs
    - name: interdict-ca-certs
      emptyDir: {}
*/}}
{{- define "interdict.sidecar.container" -}}
- name: interdict-kernel
  image: {{ include "interdict.image" (dict "service" .Values.kernel "global" .Values.global "chart" .Chart) }}
  imagePullPolicy: {{ .Values.kernel.image.pullPolicy }}
  restartPolicy: Always  # KEP-753 native sidecar -- runs for pod lifetime
  ports:
    - containerPort: 8443
      name: proxy
      protocol: TCP
  env:
    - name: KERNEL_LISTEN_ADDR
      value: {{ .Values.kernel.listenAddr | quote }}
    - name: KERNEL_ORG_ID
      value: {{ .Values.kernel.orgId | quote }}
    - name: KERNEL_LOG_LEVEL
      value: {{ .Values.kernel.logLevel | quote }}
    - name: KERNEL_LOG_FORMAT
      value: {{ .Values.kernel.logFormat | quote }}
    - name: KERNEL_ALLOWLIST_VENDORS
      value: {{ .Values.kernel.allowlistVendors | quote }}
    - name: KERNEL_FORCE_TEMPLATE
      value: {{ .Values.kernel.forceTemplate | quote }}
    - name: KERNEL_CA_CERT_PATH
      value: {{ .Values.kernel.caCertPath | quote }}
    - name: KERNEL_CA_KEY_PATH
      value: {{ .Values.kernel.caKeyPath | quote }}
    - name: KERNEL_DISTRIBUTION_ADDR
      value: {{ tpl .Values.kernel.distributionAddr . | quote }}
    - name: KERNEL_EVIDENCE_COLLECTOR_ADDR
      value: {{ tpl .Values.kernel.evidenceCollectorAddr . | quote }}
    - name: KERNEL_CONNECT_TIMEOUT_MS
      value: {{ .Values.kernel.connectTimeoutMs | quote }}
    - name: KERNEL_FIRST_BYTE_TIMEOUT_MS
      value: {{ .Values.kernel.firstByteTimeoutMs | quote }}
    - name: KERNEL_STREAM_TIMEOUT_MS
      value: {{ .Values.kernel.streamTimeoutMs | quote }}
    - name: KERNEL_MAX_REQUEST_QUEUE
      value: {{ .Values.kernel.maxRequestQueue | quote }}
    - name: KERNEL_POOL_MAX_CONNECTIONS
      value: {{ .Values.kernel.poolMaxConnections | quote }}
    - name: KERNEL_POOL_MAX_STREAMS
      value: {{ .Values.kernel.poolMaxStreams | quote }}
    - name: KERNEL_POOL_IDLE_TIMEOUT
      value: {{ .Values.kernel.poolIdleTimeout | quote }}
    - name: RUST_LOG
      value: {{ .Values.kernel.rustLog | quote }}
    {{- if .Values.kernel.mtls.enabled }}
    - name: KERNEL_MTLS_CA_CERT
      value: {{ .Values.kernel.mtls.caCertPath | quote }}
    - name: KERNEL_MTLS_CLIENT_CERT
      value: {{ .Values.kernel.mtls.clientCertPath | quote }}
    - name: KERNEL_MTLS_CLIENT_KEY
      value: {{ .Values.kernel.mtls.clientKeyPath | quote }}
    {{- end }}
  volumeMounts:
    - name: interdict-certs
      mountPath: /certs
      readOnly: true
    - name: interdict-ca-certs
      mountPath: /data/certs
    - name: interdict-tmp
      mountPath: /tmp
  resources:
    {{- toYaml .Values.sidecar.resources | nindent 4 }}
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop:
        - ALL
{{- end }}
