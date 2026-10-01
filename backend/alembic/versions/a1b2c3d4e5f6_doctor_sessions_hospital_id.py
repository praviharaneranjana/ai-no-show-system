"""Add hospital_id to doctor_sessions (missed by the multi-hospital tenancy migration).

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-10-02 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ASIRI_ID = 'a0000000-0000-0000-0000-000000000001'


def upgrade() -> None:
    op.add_column('doctor_sessions', sa.Column('hospital_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_doctor_sessions_hospital_id', 'doctor_sessions', ['hospital_id'])
    op.execute(sa.text(f"UPDATE doctor_sessions SET hospital_id = '{ASIRI_ID}' WHERE hospital_id IS NULL"))
    op.create_foreign_key(
        'fk_doctor_sessions_hospital_id', 'doctor_sessions', 'hospitals',
        ['hospital_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('fk_doctor_sessions_hospital_id', 'doctor_sessions', type_='foreignkey')
    op.drop_index('ix_doctor_sessions_hospital_id', table_name='doctor_sessions')
    op.drop_column('doctor_sessions', 'hospital_id')
