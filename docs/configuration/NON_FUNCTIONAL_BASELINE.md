# Non-Functional Configuration Baseline

Version: 1.0.0

These field names are identical in development, test, staging, and production. Environments may change values only through deployment configuration and secret stores.

## Defaults

| Configuration field              |                                      Default | Purpose                                          |
| -------------------------------- | -------------------------------------------: | ------------------------------------------------ |
| `TASK_MAX_AUTO_ITERATIONS`       |                                            4 | Maximum repair passes before `NEEDS_USER`        |
| `RUNNER_CPU_LIMIT`               |                                            2 | CPU cores per CAD execution                      |
| `RUNNER_MEMORY_MB`               |                                         4096 | Runtime memory ceiling                           |
| `RUNNER_DISK_MB`                 |                                         2048 | Writable working-copy and temporary disk ceiling |
| `RUNNER_PIDS_LIMIT`              |                                           64 | Process/thread PID ceiling                       |
| `RUNNER_TIMEOUT_SECONDS`         |                                          180 | Wall-clock execution limit                       |
| `RUNNER_LOG_BYTES`               |                                      1048576 | Combined bounded stdout/stderr size              |
| `UPLOAD_ALLOWED_EXTENSIONS`      | `.png,.jpg,.jpeg,.pdf,.docx,.step,.stp,.stl` | Initial upload allow-list                        |
| `UPLOAD_MAX_FILE_BYTES`          |                                    104857600 | 100 MiB per file                                 |
| `UPLOAD_USER_QUOTA_BYTES`        |                                   2147483648 | 2 GiB private upload quota per user              |
| `UPLOAD_MAX_FILES_PER_MESSAGE`   |                                           10 | Attachment count limit                           |
| `DOCUMENT_MAX_PAGES`             |                                          200 | PDF/DOCX parser limit                            |
| `DEFAULT_MODEL_UNIT`             |                                         `mm` | Model and UI default unit                        |
| `GEOMETRY_LINEAR_TOLERANCE_MM`   |                                         0.01 | Default exact linear tolerance                   |
| `GEOMETRY_ANGULAR_TOLERANCE_DEG` |                                          0.1 | Default angular tolerance                        |
| `VIEWER_LINEAR_DEFLECTION_MM`    |                                          0.1 | Default BRep mesh deflection                     |
| `VIEWER_ANGULAR_DEFLECTION_DEG`  |                                           15 | Default mesh angular deflection                  |
| `VIEWER_MAX_GLB_BYTES`           |                                    209715200 | 200 MiB viewer artifact ceiling                  |
| `SSE_EVENT_RETENTION_SECONDS`    |                                        86400 | Event replay retention                           |
| `SSE_RECONNECT_WINDOW_SECONDS`   |                                         3600 | Guaranteed `Last-Event-ID` replay window         |
| `SSE_HEARTBEAT_SECONDS`          |                                           15 | Heartbeat interval                               |
| `SIGNED_DOWNLOAD_TTL_SECONDS`    |                                          300 | Artifact URL lifetime                            |
| `WORKSPACE_ARCHIVE_AFTER_DAYS`   |                                           30 | Idle workspace archive threshold                 |
| `WORKSPACE_DELETE_AFTER_DAYS`    |                                           90 | Archived private workspace deletion threshold    |
| `UPLOAD_DELETE_AFTER_DAYS`       |                                           30 | Unattached upload retention                      |
| `CASE_CANDIDATE_RETENTION_DAYS`  |                                           30 | Rejected or failed candidate retention           |
| `P1_RELEASE_PASS_RATE`           |                                         0.98 | Minimum executed P1 pass rate                    |

## Retention exceptions

- Active conversations and their successful revisions are retained while the account is active and the conversation is not deleted.
- Published public Cases, consent records, review records, and publication audit records are retained according to legal policy and are not deleted by private workspace retention jobs.
- Conversation deletion revokes access immediately. Storage removal is asynchronous and auditable.
- No skipped, blocked, flaky, or unexecuted test contributes to the P1 pass-rate numerator.

## Runtime policy

- All limits are enforced outside Agent-controlled code by the Runner controller and container runtime.
- Timeout or resource exhaustion terminates the complete process tree, publishes a structured failure, and preserves the last successful revision.
- Viewer and document services have equivalent service-specific quotas and never process an unbounded input in API request threads.
- Increasing a production limit requires a capacity test and an update to this baseline.
