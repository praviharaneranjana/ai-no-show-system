"""Reschedule conversations (ask first, staff approves) and link interventions to them.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reschedule_conversations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=True),
        sa.Column('patient_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('origin_appointment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('language', sa.String(), nullable=False, server_default='en'),
        sa.Column('state', sa.String(), nullable=False, server_default='awaiting_reply'),
        sa.Column('initiated_by', sa.String(), nullable=False, server_default='staff'),
        sa.Column('requested_date', sa.Date(), nullable=True),
        sa.Column('offer', postgresql.JSONB(), nullable=True),
        sa.Column('options', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('shown_keys', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('declines', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unclear', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('handled_by_staff', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('approved_by', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('last_inbound_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_outbound_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_reschedule_conversations_hospital_id', 'reschedule_conversations', ['hospital_id'])
    op.create_index('ix_reschedule_conversations_patient_id', 'reschedule_conversations', ['patient_id'])
    op.create_index('ix_reschedule_conversations_appointment_id', 'reschedule_conversations', ['appointment_id'])
    op.create_index('ix_reschedule_conversations_state', 'reschedule_conversations', ['state'])
    op.add_column('interventions', sa.Column('conversation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('reschedule_conversations.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_interventions_conversation_id', 'interventions', ['conversation_id'])


def downgrade() -> None:
    op.drop_index('ix_interventions_conversation_id', table_name='interventions')
    op.drop_column('interventions', 'conversation_id')
    op.drop_table('reschedule_conversations')
