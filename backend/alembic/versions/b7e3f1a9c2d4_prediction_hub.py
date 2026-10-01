"""prediction hub and intake redesign

Revision ID: b7e3f1a9c2d4
Revises: a4ef2ced0ada
Create Date: 2026-10-01 12:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b7e3f1a9c2d4'
down_revision: Union[str, Sequence[str], None] = 'a4ef2ced0ada'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extensions and sequence
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    op.execute("CREATE SEQUENCE IF NOT EXISTS patient_uhid_seq START 1;")

    # ---------- reference data ----------
    op.create_table(
        'departments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.Text(), nullable=False, unique=True),
        sa.Column('model_category', sa.Text(), nullable=True),
        sa.Column('icon', sa.Text(), nullable=False, server_default='stethoscope'),
        sa.Column('telehealth_ok', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )

    op.create_table(
        'doctors',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('title', sa.Text(), nullable=False, server_default='Dr.'),
        sa.Column('full_name', sa.Text(), nullable=False),
        sa.Column('department_id', sa.Integer(), sa.ForeignKey('departments.id'), nullable=False),
        sa.Column('his_doctor_code', sa.Text(), unique=True, nullable=True),
        sa.Column('default_room', sa.Text(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('needs_review', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_doctors_department', 'doctors', ['department_id'], postgresql_where=sa.text('active = true'))

    op.create_table(
        'doctor_clinic_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('doctor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('weekday', sa.SmallInteger(), nullable=False),
        sa.Column('label', sa.Text(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('room', sa.Text(), nullable=False),
        sa.Column('max_patients', sa.Integer(), nullable=False, server_default='25'),
        sa.Column('slot_minutes', sa.Integer(), nullable=False, server_default='12'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.CheckConstraint('weekday BETWEEN 0 AND 6', name='ck_session_weekday'),
        sa.CheckConstraint("label IN ('Morning', 'Afternoon', 'Evening')", name='ck_session_label'),
        sa.UniqueConstraint('doctor_id', 'weekday', 'label', name='uq_doctor_weekday_label'),
    )

    op.create_table(
        'locations',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('name_norm', sa.Text(), nullable=False),
        sa.Column('district', sa.Text(), nullable=True),
        sa.Column('province', sa.Text(), nullable=True),
        sa.Column('kind', sa.Text(), nullable=False, server_default='town'),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('population', sa.Integer(), nullable=True),
        sa.Column('aliases', postgresql.ARRAY(sa.Text()), nullable=False, server_default='{}'),
        sa.Column('source', sa.Text(), nullable=False, server_default='geonames'),
        sa.UniqueConstraint('name_norm', 'district', name='uq_locations_norm_district'),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_locations_trgm ON locations USING gin (name_norm gin_trgm_ops);")

    # ---------- patients ----------
    op.add_column('patients', sa.Column('nic', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('district', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('address_line', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('location_id', sa.Integer(), sa.ForeignKey('locations.id'), nullable=True))
    op.add_column('patients', sa.Column('distance_source', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('preferred_language', sa.Text(), nullable=False, server_default='en'))
    op.add_column('patients', sa.Column('his_patient_ref', sa.Text(), nullable=True))

    op.create_check_constraint(
        'ck_patient_dist_source', 'patients',
        "distance_source IN ('road_osrm','estimated','manual') OR distance_source IS NULL"
    )
    op.create_check_constraint(
        'ck_patient_pref_lang', 'patients',
        "preferred_language IN ('en','si','ta')"
    )

    # Backfill UHID
    op.execute("""
        UPDATE patients
        SET uhid = 'SHAI-' || to_char(coalesce(created_at, now()),'YY') || '-' || lpad(nextval('patient_uhid_seq')::text, 6, '0')
        WHERE uhid IS NULL;
    """)
    op.execute("""
        WITH ranked AS (
          SELECT id, created_at, ROW_NUMBER() OVER (PARTITION BY uhid ORDER BY created_at ASC, id ASC) as rn
          FROM patients
          WHERE uhid IS NOT NULL
        )
        UPDATE patients p
        SET uhid = 'SHAI-' || to_char(coalesce(p.created_at, now()),'YY') || '-' || lpad(nextval('patient_uhid_seq')::text, 6, '0')
        FROM ranked r
        WHERE p.id = r.id AND r.rn > 1;
    """)
    op.alter_column('patients', 'uhid', nullable=False)
    op.create_index('uq_patients_uhid', 'patients', ['uhid'], unique=True)
    op.create_index('uq_patients_his_ref', 'patients', ['his_patient_ref'], unique=True, postgresql_where=sa.text('his_patient_ref IS NOT NULL'))
    op.create_index('ix_patients_phone', 'patients', ['phone'])
    op.create_index('ix_patients_nic', 'patients', ['nic'], postgresql_where=sa.text('nic IS NOT NULL'))
    op.execute("CREATE INDEX IF NOT EXISTS ix_patients_name_trgm ON patients USING gin (lower(full_name) gin_trgm_ops);")

    # ---------- appointments ----------
    op.add_column('appointments', sa.Column('doctor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctors.id'), nullable=True))
    op.add_column('appointments', sa.Column('clinic_session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctor_clinic_sessions.id'), nullable=True))
    op.add_column('appointments', sa.Column('source', sa.Text(), nullable=False, server_default='manual'))
    op.add_column('appointments', sa.Column('external_ref', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('his_synced_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('booked_by', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('booking_notes', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('sms_reminder_opt_in', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('appointments', sa.Column('reminder_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('cancel_reason', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('late_cancel', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('appointments', sa.Column('rescheduled_from_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('appointments.id'), nullable=True))
    op.add_column('appointments', sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('no_show_reason', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('outcome_recorded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('appointments', sa.Column('outcome_recorded_by', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('outcome_source', sa.Text(), nullable=True))

    op.create_check_constraint('ck_appt_source', 'appointments', "source IN ('manual','his_sync')")
    op.create_check_constraint('ck_appt_outcome_source', 'appointments', "outcome_source IN ('staff','system','his_sync') OR outcome_source IS NULL")

    op.create_index('uq_appt_external', 'appointments', ['source', 'external_ref'], unique=True, postgresql_where=sa.text('external_ref IS NOT NULL'))
    op.create_index('uq_appt_patient_doctor_day', 'appointments', ['patient_id', 'doctor_id', 'appointment_day'], unique=True, postgresql_where=sa.text("status = 'scheduled' AND doctor_id IS NOT NULL"))
    op.create_index('uq_appt_token', 'appointments', ['doctor_id', 'appointment_day', 'clinic_session_id', 'queue_number'], unique=True, postgresql_where=sa.text("source = 'manual' AND status <> 'cancelled' AND queue_number IS NOT NULL"))
    op.create_index('ix_appt_day_doctor', 'appointments', ['appointment_day', 'doctor_id'])

    # ---------- appointment_events ----------
    op.create_table(
        'appointment_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.Text(), nullable=False),
        sa.Column('from_status', sa.Text(), nullable=True),
        sa.Column('to_status', sa.Text(), nullable=True),
        sa.Column('actor', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('payload', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_events_appt', 'appointment_events', ['appointment_id', 'created_at'])

    # ---------- prediction_log ----------
    op.create_table(
        'prediction_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stage', sa.Text(), nullable=False),
        sa.Column('features', postgresql.JSONB(), nullable=False),
        sa.Column('risk_score', sa.Numeric(5, 4), nullable=False),
        sa.Column('risk_category', sa.Text(), nullable=False),
        sa.Column('model_version', sa.Text(), nullable=False),
        sa.Column('prediction_run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("stage IN ('booking','import','rescore')", name='ck_predlog_stage'),
    )
    op.create_index('ix_predlog_appt', 'prediction_log', ['appointment_id', 'created_at'])

    # ---------- simulated hospital system (the "HIS") ----------
    op.create_table(
        'his_appointments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('his_ref', sa.Text(), nullable=False, unique=True),
        sa.Column('his_patient_ref', sa.Text(), nullable=False),
        sa.Column('patient_name', sa.Text(), nullable=False),
        sa.Column('date_of_birth', sa.Date(), nullable=False),
        sa.Column('gender', sa.Text(), nullable=True),
        sa.Column('phone', sa.Text(), nullable=True),
        sa.Column('nic', sa.Text(), nullable=True),
        sa.Column('city', sa.Text(), nullable=True),
        sa.Column('doctor_code', sa.Text(), nullable=False),
        sa.Column('doctor_name', sa.Text(), nullable=False),
        sa.Column('department', sa.Text(), nullable=False),
        sa.Column('appointment_date', sa.Date(), nullable=False),
        sa.Column('appointment_time', sa.Time(), nullable=False),
        sa.Column('booked_on', sa.Date(), nullable=False),
        sa.Column('booking_channel', sa.Text(), nullable=True),
        sa.Column('payment_mode', sa.Text(), nullable=True),
        sa.Column('token_no', sa.Integer(), nullable=True),
        sa.Column('his_status', sa.Text(), nullable=False, server_default='booked'),
        sa.Column('hypertension', sa.Boolean(), nullable=True),
        sa.Column('diabetes', sa.Boolean(), nullable=True),
        sa.Column('alcoholism', sa.Boolean(), nullable=True),
        sa.Column('handicap', sa.Integer(), nullable=True),
        sa.Column('scholarship', sa.Boolean(), nullable=True),
        sa.Column('sms_sent', sa.Boolean(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("his_status IN ('booked','arrived','completed','no_show','cancelled')", name='ck_his_status'),
    )
    op.create_index('ix_his_appt_date', 'his_appointments', ['appointment_date'])

    op.create_table(
        'his_sync_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('target_date', sa.Date(), nullable=False),
        sa.Column('trigger', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('fetched', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unchanged', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('triggered_by', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("trigger IN ('manual','auto','combined_run')", name='ck_sync_trigger'),
        sa.CheckConstraint("status IN ('running','done','failed')", name='ck_sync_status'),
    )

    op.create_table(
        'prediction_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('run_date', sa.Date(), nullable=False),
        sa.Column('doctor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('doctors.id'), nullable=True),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('stage', sa.Text(), nullable=False, server_default='queued'),
        sa.Column('with_sync', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('scored', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('high', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('medium', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('low', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expected_no_shows', sa.Numeric(6, 2), nullable=True),
        sa.Column('model_version', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('triggered_by', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('queued','running','done','failed')", name='ck_pred_run_status'),
    )


def downgrade() -> None:
    op.drop_table('prediction_runs')
    op.drop_table('his_sync_runs')
    op.drop_table('his_appointments')
    op.drop_table('prediction_log')
    op.drop_table('appointment_events')

    op.drop_index('ix_appt_day_doctor', table_name='appointments')
    op.drop_index('uq_appt_token', table_name='appointments')
    op.drop_index('uq_appt_patient_doctor_day', table_name='appointments')
    op.drop_index('uq_appt_external', table_name='appointments')

    op.drop_constraint('ck_appt_outcome_source', 'appointments', type_='check')
    op.drop_constraint('ck_appt_source', 'appointments', type_='check')

    for col in [
        'outcome_source', 'outcome_recorded_by', 'outcome_recorded_at', 'no_show_reason',
        'checked_in_at', 'rescheduled_from_id', 'late_cancel', 'cancel_reason', 'cancelled_at',
        'reminder_sent_at', 'sms_reminder_opt_in', 'booking_notes', 'booked_by', 'his_synced_at',
        'external_ref', 'source', 'clinic_session_id', 'doctor_id'
    ]:
        op.drop_column('appointments', col)

    op.execute("DROP INDEX IF EXISTS ix_patients_name_trgm;")
    op.drop_index('ix_patients_nic', table_name='patients')
    op.drop_index('ix_patients_phone', table_name='patients')
    op.drop_index('uq_patients_his_ref', table_name='patients')
    op.drop_index('uq_patients_uhid', table_name='patients')

    op.drop_constraint('ck_patient_pref_lang', 'patients', type_='check')
    op.drop_constraint('ck_patient_dist_source', 'patients', type_='check')

    for col in [
        'his_patient_ref', 'preferred_language', 'distance_source',
        'location_id', 'address_line', 'district', 'nic'
    ]:
        op.drop_column('patients', col)

    op.alter_column('patients', 'uhid', nullable=True)

    op.execute("DROP INDEX IF EXISTS ix_locations_trgm;")
    op.drop_table('locations')
    op.drop_table('doctor_clinic_sessions')
    op.drop_table('doctors')
    op.drop_table('departments')
    op.execute("DROP SEQUENCE IF EXISTS patient_uhid_seq;")
