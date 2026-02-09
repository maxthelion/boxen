#!/usr/bin/env python3
"""List all configured Octopoid agents with their status.

Usage:
    orchestrator/venv/bin/python .orchestrator/scripts/list_agents.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from status import print_agent_status

if __name__ == "__main__":
    print_agent_status()
