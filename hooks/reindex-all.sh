#!/bin/bash
# Re-index all collective repos in gitnexus
# Usage: bash /mnt/c/projects/ai-agents/gitnexus/hooks/reindex-all.sh [--stale-only]

GITNEXUS_CLI="node /mnt/c/projects/ai-agents/gitnexus/gitnexus/dist/cli/index.js"
STALE_THRESHOLD_HOURS=48
REPOS=(
    "/mnt/c/projects/ai-agents/SAGE"
    "/mnt/c/projects/ai-agents/web4"
    "/mnt/c/projects/ai-agents/hardbound"
    "/mnt/c/projects/ai-agents/Synchronism"
    "/mnt/c/projects/ai-agents/4-life"
    "/mnt/c/projects/ai-agents/private-context"
    "/mnt/c/projects/ai-agents/engram"
    "/mnt/c/projects/ai-agents/ACT"
    "/mnt/c/projects/ai-agents/claude-code"
    "/mnt/c/projects/ai-agents/memory"
)

stale_only=false
if [ "$1" = "--stale-only" ]; then
    stale_only=true
fi

for repo in "${REPOS[@]}"; do
    if [ ! -d "$repo/.git" ]; then
        echo "SKIP $repo (not a git repo)"
        continue
    fi

    name=$(basename "$repo")

    if $stale_only; then
        # Check if index exists and is fresh enough
        if [ -d "$repo/.gitnexus" ]; then
            index_age=$(( ( $(date +%s) - $(stat -c %Y "$repo/.gitnexus" 2>/dev/null || echo 0) ) / 3600 ))
            if [ "$index_age" -lt "$STALE_THRESHOLD_HOURS" ]; then
                echo "FRESH $name (${index_age}h old)"
                continue
            fi
        fi
    fi

    echo "INDEXING $name..."
    cd "$repo" && $GITNEXUS_CLI analyze 2>&1 | tail -3
    # Touch the index dir so staleness check reflects last verify time
    touch "$repo/.gitnexus" 2>/dev/null
    echo ""
done

echo "Done. Run 'node $GITNEXUS_CLI list' to verify."
