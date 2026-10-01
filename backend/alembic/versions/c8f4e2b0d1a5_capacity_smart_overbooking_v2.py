"""capacity smart overbooking v2

Revision ID: c8f4e2b0d1a5
Revises: b7e3f1a9c2d4
Create Date: 2026-10-01 13:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c8f4e2b0d1a5'
down_revision: Union[str, Sequence[str], None] = 'b7e3f1a9c2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update existing tables
    op.add_column('departments', sa.Column('default_consultation_fee_lkr', sa.Float(), nullable=False, server_default='4500.0'))
    op.add_column('doctors', sa.Column('consultation_fee_lkr', sa.Float(), nullable=False, server_default='4500.0'))
    op.add_column('doctor_clinic_sessions', sa.Column('delay_minutes', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('doctor_clinic_sessions', sa.Column('delay_status', sa.Text(), nullable=False, server_default='on_time'))
    op.add_column('appointments', sa.Column('slot_start', sa.Time(), nullable=True))

    # Add useful lookup indexes
    op.create_index('ix_appointments_doctor_date', 'appointments', ['doctor_id', 'appointment_day'])
    op.create_index('ix_appointments_session_slot', 'appointments', ['clinic_session_id', 'slot_start'])

    # 2. Create capacity_settings
    op.create_table(
        'capacity_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('scope', sa.Text(), nullable=False, server_default='global'),
        sa.Column('department_id', sa.Integer(), sa.ForeignKey('departments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('doctor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctors.id', ondelete='CASCADE'), nullable=True),
        sa.Column('safety_factor', sa.Float(), nullable=False, server_default='0.75'),
        sa.Column('max_overbook_per_slot', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('max_overbook_per_session', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('wait_tolerance_mins', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('consultation_fee_lkr', sa.Float(), nullable=False, server_default='4500.0'),
        sa.Column('badge_safe_mins', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('badge_moderate_mins', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('auto_assign_waitlist', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('sim_runs', sa.Integer(), nullable=False, server_default='2000'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_capacity_settings_scope', 'capacity_settings', ['scope', 'department_id', 'doctor_id'])

    # 3. Create capacity_recommendations
    op.create_table(
        'capacity_recommendations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('doctor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('clinic_session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctor_clinic_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('slot_time', sa.Time(), nullable=True),
        sa.Column('target_date', sa.Date(), nullable=False),
        sa.Column('booked_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expected_no_shows', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('interval_low', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('interval_high', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('recommended_overbook', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expected_wait_mins', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('expected_revenue_lkr', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('p_overcrowding', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('effective_tolerance_mins', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('settings_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('model_version', sa.Text(), nullable=False, server_default='shai-lk-synth-v1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_capacity_rec_date_doc', 'capacity_recommendations', ['target_date', 'doctor_id'])

    # 4. Create capacity_scenarios
    op.create_table(
        'capacity_scenarios',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('params', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('results', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_by', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 5. Create slot_offers
    op.create_table(
        'slot_offers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('doctor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('clinic_session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctor_clinic_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('slot_time', sa.Time(), nullable=False),
        sa.Column('slot_date', sa.Date(), nullable=False),
        sa.Column('freed_reason', sa.Text(), nullable=False),
        sa.Column('waitlist_entry_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('waitlist.id', ondelete='CASCADE'), nullable=False),
        sa.Column('match_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('score_breakdown', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('status', sa.Text(), nullable=False, server_default='proposed'),
        sa.Column('acted_by', sa.Text(), nullable=True),
        sa.Column('acted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_slot_offers_status', 'slot_offers', ['status', 'slot_date'])

    # 6. Backfill Appointment links
    op.execute("""
        UPDATE appointments a
        SET doctor_id = d.id
        FROM doctors d
        WHERE a.doctor_id IS NULL
          AND a.doctor_name IS NOT NULL
          AND (a.doctor_name = d.full_name OR a.doctor_name ILIKE '%' || d.full_name || '%');
    """)

    # Backfill slot_start from scheduled_time (HH:MM)
    op.execute("""
        UPDATE appointments
        SET slot_start = CAST(SUBSTRING(scheduled_time FROM '^[0-9]{1,2}:[0-9]{2}') AS time)
        WHERE slot_start IS NULL
          AND scheduled_time IS NOT NULL
          AND scheduled_time ~ '^[0-9]{1,2}:[0-9]{2}';
    """)

    # Seed default global settings row if empty
    op.execute("""
        INSERT INTO capacity_settings (scope, safety_factor, max_overbook_per_slot, max_overbook_per_session, wait_tolerance_mins, consultation_fee_lkr, badge_safe_mins, badge_moderate_mins, auto_assign_waitlist, sim_runs)
        SELECT 'global', 0.75, 2, 4, 15, 4500.0, 8, 15, false, 2000
        WHERE NOT EXISTS (SELECT 1 FROM capacity_settings WHERE scope = 'global');
    """)


def downgrade() -> None:
    op.drop_index('ix_slot_offers_status', table_name='slot_offers')
    op.drop_table('slot_offers')
    op.drop_table('capacity_scenarios')
    op.drop_index('ix_capacity_rec_date_doc', table_name='capacity_recommendations')
    op.drop_table('capacity_recommendations')
    op.drop_index('ix_capacity_settings_scope', table_name='capacity_settings')
    op.drop_table('capacity_settings')

    op.drop_index('ix_appointments_session_slot', table_name='appointments')
    op.drop_index('ix_appointments_doctor_date', table_name='appointments')
    op.drop_column('appointments', 'slot_start')
    op.drop_column('doctor_clinic_sessions', 'delay_status')
    op.drop_column('doctor_clinic_sessions', 'delay_minutes')
    op.drop_column('doctors', 'consultation_fee_lkr')
    op.drop_column('departments', 'default_consultation_fee_lkr')
