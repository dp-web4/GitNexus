#!/bin/bash
# GitNexus SessionStart hook for Claude Code
# Outputs a brief summary of indexed repos and staleness to Claude's context.
# Silent failure — should never block Claude Code startup.

STALE_THRESHOLD_HOURS=48
AI_AGENTS="/mnt/c/projects/ai-agents"
REPOS=(SAGE web4 hardbound Synchronism 4-life private-context engram ACT claude-code memory)

total_repos=0
total_stale=0
stale_list=""
now_epoch=$(date +%s)

for name in "${REPOS[@]}"; do
    index_dir="$AI_AGENTS/$name/.gitnexus"
    if [ -d "$index_dir" ]; then
        total_repos=$((total_repos + 1))
        index_epoch=$(stat -c %Y "$index_dir/graph.db" 2>/dev/null || stat -c %Y "$index_dir" 2>/dev/null || echo "$now_epoch")
        hours_old=$(( (now_epoch - index_epoch) / 3600 ))
        if [ "$hours_old" -gt "$STALE_THRESHOLD_HOURS" ]; then
            total_stale=$((total_stale + 1))
            stale_list="${stale_list}  - ${name} (${hours_old}h old)\n"
        fi
    fi
done

if [ "$total_repos" -eq 0 ]; then
    exit 0
fi

output="<gitnexus-context>\n"
output+="GitNexus: ${total_repos} repos indexed."

if [ "$total_stale" -gt 0 ]; then
    output+=" ${total_stale} stale (>${STALE_THRESHOLD_HOURS}h):\n${stale_list}"
    output+="Reindex: bash $AI_AGENTS/gitnexus/hooks/reindex-all.sh --stale-only\n"
else
    output+=" All fresh.\n"
fi

output+="Use gitnexus for: dependency/impact analysis, cross-repo structural queries, execution flow tracing.\n"
output+="</gitnexus-context>"

echo -e "$output"
