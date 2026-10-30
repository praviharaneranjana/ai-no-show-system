"""add expense categories and hospital expenses

Revision ID: d9a5f1e8c3b2
Revises: c8f4e2b0d1a5
Create Date: 2026-10-01 13:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd9a5f1e8c3b2'
down_revision: Union[str, Sequence[str], None] = 'c8f4e2b0d1a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'expense_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('icon', sa.String(), nullable=False, server_default='receipt'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_expense_categories_key', 'expense_categories', ['key'], unique=True)

    op.create_table(
        'hospital_expenses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_name', sa.String(), nullable=False, server_default='Default Hospital'),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('expense_categories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('amount_lkr', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('recurrence', sa.String(), nullable=False, server_default='annual'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('hospital_expenses')
    op.drop_index('ix_expense_categories_key', table_name='expense_categories')
    op.drop_table('expense_categories')
