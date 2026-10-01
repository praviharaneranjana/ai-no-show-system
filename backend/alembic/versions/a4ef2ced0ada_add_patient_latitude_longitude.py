"""add patient latitude longitude

Revision ID: a4ef2ced0ada
Revises: 7c1d9a4e52b0
Create Date: 2026-10-01 03:50:52.042997

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4ef2ced0ada'
down_revision: Union[str, Sequence[str], None] = '7c1d9a4e52b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('patients', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('patients', sa.Column('longitude', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('patients', 'longitude')
    op.drop_column('patients', 'latitude')
