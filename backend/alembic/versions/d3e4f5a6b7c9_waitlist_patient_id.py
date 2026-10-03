"""waitlist.patient_id (link a waitlist entry to a registered patient so it can be booked into a free slot)

Revision ID: d3e4f5a6b7c9
Revises: c2d3e4f5a6b8
Create Date: 2026-10-03 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd3e4f5a6b7c9'
down_revision: Union[str, None] = 'c2d3e4f5a6b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('waitlist', sa.Column('patient_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_waitlist_patient_id', 'waitlist', 'patients', ['patient_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_waitlist_patient_id', 'waitlist', type_='foreignkey')
    op.drop_column('waitlist', 'patient_id')
