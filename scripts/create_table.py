"""Create the DynamoDB results table `wingin_games` (PAY_PER_REQUEST) if missing (§B19.4).

Usage: AWS_REGION=us-east-1 [DDB_TABLE=wingin_games] python scripts/create_table.py
"""

from __future__ import annotations

import os
import sys
from typing import Any


def table_spec(name: str) -> dict[str, Any]:
    """create_table arguments: partition key `game_id` (S), on-demand."""
    return {
        "TableName": name,
        "AttributeDefinitions": [{"AttributeName": "game_id", "AttributeType": "S"}],
        "KeySchema": [{"AttributeName": "game_id", "KeyType": "HASH"}],
        "BillingMode": "PAY_PER_REQUEST",
    }


def main() -> int:
    import boto3

    region = os.environ.get("AWS_REGION", "us-east-1")
    name = os.environ.get("DDB_TABLE") or "wingin_games"
    client = boto3.client("dynamodb", region_name=region)
    existing = client.list_tables().get("TableNames", [])
    if name in existing:
        print(f"table {name} already exists in {region}")
        return 0
    client.create_table(**table_spec(name))
    client.get_waiter("table_exists").wait(TableName=name)
    print(f"created table {name} in {region}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
