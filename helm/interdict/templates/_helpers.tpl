{{/*
Expand the name of the chart.
*/}}
{{- define "interdict.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "interdict.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "interdict.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "interdict.labels" -}}
helm.sh/chart: {{ include "interdict.chart" . }}
{{ include "interdict.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "interdict.selectorLabels" -}}
app.kubernetes.io/name: {{ include "interdict.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "interdict.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "interdict.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper image name for a service.
Usage: {{ include "interdict.image" (dict "service" .Values.kernel "global" .Values.global "chart" .Chart) }}
*/}}
{{- define "interdict.image" -}}
{{- $registry := .service.image.registry | default .global.imageRegistry | default "" -}}
{{- $repository := .service.image.repository -}}
{{- $tag := .service.image.tag | default .chart.AppVersion -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repository $tag -}}
{{- else -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}
{{- end }}

{{/*
Return imagePullSecrets if defined.
*/}}
{{- define "interdict.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- range .Values.global.imagePullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Validate that a required credential is provided either as a value or via existingSecret.
Usage: {{ include "interdict.validateRequired" (dict "name" "postgresql.auth.password" "value" .Values.postgresql.auth.password "existingSecret" .Values.postgresql.auth.existingSecret) }}
*/}}
{{- define "interdict.validateRequired" -}}
{{- if and (not .value) (not .existingSecret) -}}
{{- fail (printf "%s is required — set it via --set or provide existingSecret" .name) -}}
{{- end -}}
{{- end -}}
