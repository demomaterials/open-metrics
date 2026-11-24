{{/* include "metrics.labels" (dict "root" . "name" "metrics-backend" "component" "backend") */}}
{{- define "metrics.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/part-of: open-metrics
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ .root.Chart.Name }}-{{ .root.Chart.Version }}
{{- end }}

{{/* Non-sensitive backend configuration as a flat map (ConfigMap + migration Job). */}}
{{- define "metrics.config" -}}
DB_HOST: {{ .Values.db.host | quote }}
DB_PORT: {{ .Values.db.port | quote }}
DB_NAME: {{ .Values.db.name | quote }}
DB_USER: {{ .Values.db.user | quote }}
DB_SSLMODE: {{ .Values.db.sslmode | quote }}
SESSION_HOURS: {{ .Values.config.sessionHours | quote }}
COOKIE_SECURE: {{ .Values.config.cookieSecure | quote }}
ADMIN_USERNAME: {{ .Values.config.adminUsername | quote }}
SEED_DEMO: {{ .Values.config.seedDemo | quote }}
LOG_LEVEL: {{ .Values.config.logLevel | quote }}
EXTERNAL_STATEMENT_TIMEOUT_MS: {{ .Values.config.externalStatementTimeoutMs | quote }}
{{- if .Values.sampleSource.enabled }}
SAMPLE_SOURCE_HOST: {{ .Values.sampleSource.host | quote }}
SAMPLE_SOURCE_DATABASE: {{ .Values.sampleSource.database | quote }}
SAMPLE_SOURCE_USER: {{ .Values.sampleSource.user | quote }}
{{- end }}
{{- end }}

{{- define "metrics.secretEnv" -}}
- name: DB_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ .Values.secrets.db }}, key: APP_DB_PASSWORD } }
- name: SECRET_ENCRYPTION_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.secrets.app }}, key: SECRET_ENCRYPTION_KEY } }
{{- end }}

{{- define "metrics.podSecurity" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  seccompProfile: { type: RuntimeDefault }
{{- end }}

{{- define "metrics.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: ["ALL"] }
{{- end }}

{{- define "metrics.imagePullSecrets" -}}
{{- with .Values.imagePullSecrets }}
imagePullSecrets: {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
