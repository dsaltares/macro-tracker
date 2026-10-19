#!/usr/bin/env bash
set -euo pipefail

# The workflow pipes this script into `bash -s`, which reads it from stdin as it runs, and
# `docker compose exec` reads stdin too. Everything runs inside main, called on the last line,
# so bash has parsed the whole script before any command can consume the rest of it.
main() {
  local usage='Usage: deploy.sh <compose directory> <service> <revision>'
  local compose_directory=${1:?$usage}
  local service=${2:?$usage}
  local revision=${3:?$usage}

  # Compose recreates a container by first creating `${oldID:0:12}_${container_name}`, then
  # renaming that replacement into place. Two overlapping deploys of the same container both
  # request that name. Hold this lock for the whole deploy, including the backup.
  local lock_file="/tmp/deploy-${service}.lock"
  exec 9>"$lock_file"
  if ! flock -w 600 9; then
    echo "Timed out waiting for another deploy of $service." >&2
    exit 1
  fi

  cd "$compose_directory"
  remove_interrupted_recreate "$service"

  if [ -n "$(docker compose ps --status running --quiet "$service")" ]; then
    docker compose exec -T "$service" \
      node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backup-database.ts </dev/null
  else
    echo "$service is not running, so there is no database to back up."
  fi

  docker compose pull "$service"
  docker compose up -d "$service"

  local container running
  container=$(docker compose ps --quiet "$service")
  running=$(docker inspect "$container" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  if [ "$running" != "$revision" ]; then
    echo "$service is running revision ${running:-unknown}, not $revision: the pull did not replace the image." >&2
    exit 1
  fi
  echo "$service is running revision $revision."
}

# An interrupted recreate leaves the replacement under its temporary name, still labelled as
# this service. The next recreate of the same container asks for that name again and conflicts.
remove_interrupted_recreate() {
  local service=$1
  local id name
  while read -r id name; do
    [ -n "$id" ] || continue
    if [[ "$name" =~ ^[0-9a-f]{12}_ ]]; then
      echo "Removing leftover container ${name} from an interrupted recreate."
      docker rm -f "$id"
    fi
  done < <(docker ps -a \
    --filter "label=com.docker.compose.service=${service}" \
    --format '{{.ID}} {{.Names}}')
}

main "$@"
