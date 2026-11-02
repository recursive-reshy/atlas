// Shaped like Litestream 0.5's /metrics (Prometheus text exposition), trimmed to what we read.
export const litestreamMetricsText = ( syncCount: number, syncErrors: number ): string => {
  return `# HELP go_goroutines Number of goroutines that currently exist.
# TYPE go_goroutines gauge
go_goroutines 12

# HELP litestream_db_size The current size of the database file in bytes
# TYPE litestream_db_size gauge
litestream_db_size{db="/data/atlas.db"} 1.048576e+06

# HELP litestream_sync_count Number of sync operations performed
# TYPE litestream_sync_count counter
litestream_sync_count{db="/data/atlas.db"} ${ syncCount }

# HELP litestream_sync_error_count Number of sync errors that have occurred
# TYPE litestream_sync_error_count counter
litestream_sync_error_count{db="/data/atlas.db"} ${ syncErrors }
`
}
