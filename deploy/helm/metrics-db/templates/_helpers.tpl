{{- define "metricsdb.labels" -}}
app.kubernetes.io/name: metrics-db
app.kubernetes.io/component: database
app.kubernetes.io/part-of: open-metrics
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}
