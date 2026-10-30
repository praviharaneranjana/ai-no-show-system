"""Rescale consultation fees so the average outpatient visit is about LKR 2,500 (was 4,500 / CSV mean 4,745)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-04 10:00:00.000000

Data migration. It is guarded: fees are only rescaled while the average recorded visit fee is still above
LKR 3,500, so running it twice cannot scale them twice. Downgrade restores the column defaults but does not
undo the rescale (the original fees were an unsourced assumption, not data worth restoring).
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TARGET = 2500.0
CSV_MEAN = 4745.0
SCALE = TARGET / CSV_MEAN
DEFAULT_TABLES = (('departments', 'default_consultation_fee_lkr'), ('doctors', 'consultation_fee_lkr'),
                  ('capacity_settings', 'consultation_fee_lkr'))


def upgrade() -> None:
    for table, col in DEFAULT_TABLES:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT {TARGET}")

    already = op.get_bind().exec_driver_sql(
        "SELECT COALESCE(AVG(fee_lkr), 0) FROM appointments WHERE fee_lkr IS NOT NULL"
    ).scalar()
    if float(already) <= 3500.0:
        return  # nothing recorded yet, or already rescaled
    op.execute(f"UPDATE appointments SET fee_lkr = ROUND(fee_lkr * {SCALE} / 50.0) * 50.0 WHERE fee_lkr IS NOT NULL")
    for table, col in DEFAULT_TABLES:
        op.execute(
            f"UPDATE {table} SET {col} = CASE WHEN {col} = 4500.0 THEN {TARGET} "
            f"ELSE ROUND({col} * {SCALE} / 50.0) * 50.0 END WHERE {col} > 0"
        )


def downgrade() -> None:
    for table, col in DEFAULT_TABLES:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} SET DEFAULT 4500.0")
