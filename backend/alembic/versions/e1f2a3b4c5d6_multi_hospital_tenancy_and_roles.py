"""multi hospital tenancy and roles

Revision ID: e1f2a3b4c5d6
Revises: d9a5f1e8c3b2
Create Date: 2026-10-01 22:45:00.000000

"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd9a5f1e8c3b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ASIRI_ID = uuid.UUID('a0000000-0000-0000-0000-000000000001')
NHSL_ID = uuid.UUID('a0000000-0000-0000-0000-000000000002')


def upgrade() -> None:
    # 1. Create hospitals table
    op.create_table(
        'hospitals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('short_name', sa.String(), nullable=False),
        sa.Column('legal_name', sa.String(), nullable=True),
        sa.Column('logo_file_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('logo_url', sa.String(), nullable=True),
        sa.Column('brand_color', sa.String(), nullable=False, server_default='#8B7CF6'),
        sa.Column('established_date', sa.Date(), nullable=True),
        sa.Column('hospital_type', sa.String(), nullable=False, server_default='private'),
        sa.Column('registration_number', sa.String(), nullable=True),
        sa.Column('bed_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('address_line1', sa.String(), nullable=True),
        sa.Column('address_line2', sa.String(), nullable=True),
        sa.Column('city', sa.String(), nullable=False, server_default='Colombo'),
        sa.Column('district', sa.String(), nullable=False, server_default='Colombo'),
        sa.Column('province', sa.String(), nullable=False, server_default='Western'),
        sa.Column('postal_code', sa.String(), nullable=False, server_default='01000'),
        sa.Column('country', sa.String(), nullable=False, server_default='Sri Lanka'),
        sa.Column('latitude', sa.Float(), nullable=False, server_default='6.9271'),
        sa.Column('longitude', sa.Float(), nullable=False, server_default='79.8612'),
        sa.Column('timezone', sa.String(), nullable=False, server_default='Asia/Colombo'),
        sa.Column('currency', sa.String(), nullable=False, server_default='LKR'),
        sa.Column('website', sa.String(), nullable=True),
        sa.Column('main_phone', sa.String(), nullable=True),
        sa.Column('main_email', sa.String(), nullable=True),
        sa.Column('emergency_phone', sa.String(), nullable=True),
        sa.Column('about', sa.Text(), nullable=True),
        sa.Column('accreditations', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('go_live_date', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_hospitals_slug', 'hospitals', ['slug'], unique=True)

    # 2. Create stored_files table
    op.create_table(
        'stored_files',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=True),
        sa.Column('kind', sa.String(), nullable=False, server_default='image'),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(), nullable=False),
        sa.Column('storage_path', sa.String(), nullable=False),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 3. Create hospital_email_domains table
    op.create_table(
        'hospital_email_domains',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('domain', sa.String(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_hospital_email_domains_domain', 'hospital_email_domains', ['domain'], unique=True)
    op.create_index('ix_hospital_email_domains_hospital_id', 'hospital_email_domains', ['hospital_id'])

    # 4. Create hospital_memberships table
    op.create_table(
        'hospital_memberships',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(), nullable=False, server_default='front_desk'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('job_title', sa.String(), nullable=True),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('employee_code', sa.String(), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'hospital_id', name='uq_user_hospital_membership')
    )
    op.create_index('ix_hospital_memberships_user_id', 'hospital_memberships', ['user_id'])
    op.create_index('ix_hospital_memberships_hospital_id', 'hospital_memberships', ['hospital_id'])

    # 5. Create staff_invitations table
    op.create_table(
        'staff_invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('invited_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_staff_invitations_email', 'staff_invitations', ['email'])
    op.create_index('ix_staff_invitations_token_hash', 'staff_invitations', ['token_hash'], unique=True)

    # 6. Create hospital_management_members table
    op.create_table(
        'hospital_management_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('position', sa.String(), nullable=False),
        sa.Column('photo_file_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='true'),
    )

    # 7. Create hospital_contacts table
    op.create_table(
        'hospital_contacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
    )

    # 8. Create hospital_partners table
    op.create_table(
        'hospital_partners',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('logo_file_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('website', sa.String(), nullable=True),
        sa.Column('since_date', sa.Date(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_official', sa.Boolean(), nullable=False, server_default='true'),
    )

    # 9. Create hospital_audit_logs table
    op.create_table(
        'hospital_audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('hospital_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', sa.String(), nullable=True),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_hospital_audit_logs_hospital_id', 'hospital_audit_logs', ['hospital_id'])

    # 10. Seed two initial hospitals and their email domains
    hospitals_table = sa.table(
        'hospitals',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('slug', sa.String),
        sa.column('name', sa.String),
        sa.column('short_name', sa.String),
        sa.column('city', sa.String),
        sa.column('district', sa.String),
        sa.column('province', sa.String),
        sa.column('postal_code', sa.String),
        sa.column('country', sa.String),
        sa.column('latitude', sa.Float),
        sa.column('longitude', sa.Float),
        sa.column('hospital_type', sa.String),
        sa.column('bed_count', sa.Integer),
        sa.column('main_phone', sa.String),
        sa.column('main_email', sa.String),
        sa.column('is_active', sa.Boolean),
    )

    domains_table = sa.table(
        'hospital_email_domains',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('hospital_id', postgresql.UUID(as_uuid=True)),
        sa.column('domain', sa.String),
        sa.column('is_primary', sa.Boolean),
    )

    op.bulk_insert(
        hospitals_table,
        [
            {
                'id': ASIRI_ID,
                'slug': 'asiri-central',
                'name': 'Asiri Central Hospital',
                'short_name': 'Asiri Central',
                'city': 'Colombo 10',
                'district': 'Colombo',
                'province': 'Western',
                'postal_code': '01000',
                'country': 'Sri Lanka',
                'latitude': 6.9271,
                'longitude': 79.8612,
                'hospital_type': 'private',
                'bed_count': 320,
                'main_phone': '+94 11 466 5500',
                'main_email': 'info@asiri.lk',
                'is_active': True,
            },
            {
                'id': NHSL_ID,
                'slug': 'nhsl-colombo',
                'name': 'National Hospital of Sri Lanka',
                'short_name': 'NHSL Colombo',
                'city': 'Colombo 08',
                'district': 'Colombo',
                'province': 'Western',
                'postal_code': '00800',
                'country': 'Sri Lanka',
                'latitude': 6.9195,
                'longitude': 79.8687,
                'hospital_type': 'government',
                'bed_count': 3200,
                'main_phone': '+94 11 269 1111',
                'main_email': 'info@nhsl.health.gov.lk',
                'is_active': True,
            },
        ]
    )

    op.bulk_insert(
        domains_table,
        [
            {
                'id': uuid.uuid4(),
                'hospital_id': ASIRI_ID,
                'domain': 'asiri.lk',
                'is_primary': True,
            },
            {
                'id': uuid.uuid4(),
                'hospital_id': NHSL_ID,
                'domain': 'nhsl.health.gov.lk',
                'is_primary': True,
            },
        ]
    )

    # 11. Add hospital_id FK to tenant-scoped tables
    tenant_tables = [
        'patients',
        'appointments',
        'doctors',
        'departments',
        'doctor_clinic_sessions',
        'predictions',
        'capacity_settings',
        'capacity_recommendations',
        'capacity_scenarios',
        'waitlist',
        'slot_offers',
        'hospital_expenses',
        'interventions',
        'prediction_runs',
    ]

    for table in tenant_tables:
        op.add_column(
            table,
            sa.Column('hospital_id', postgresql.UUID(as_uuid=True), nullable=True)
        )
        op.create_index(f'ix_{table}_hospital_id', table, ['hospital_id'])
        # Backfill existing data to Asiri Central Hospital
        op.execute(sa.text(f"UPDATE {table} SET hospital_id = '{str(ASIRI_ID)}' WHERE hospital_id IS NULL"))
        op.create_foreign_key(
            f'fk_{table}_hospital_id',
            table,
            'hospitals',
            ['hospital_id'],
            ['id'],
            ondelete='CASCADE'
        )

    # 12. Backfill hospital memberships for existing users
    op.execute(
        sa.text(
            f"""
            INSERT INTO hospital_memberships (id, user_id, hospital_id, role, is_active, joined_at)
            SELECT gen_random_uuid(), id, '{str(ASIRI_ID)}', role, is_active, created_at
            FROM users
            ON CONFLICT (user_id, hospital_id) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    tenant_tables = [
        'patients',
        'appointments',
        'doctors',
        'departments',
        'doctor_clinic_sessions',
        'predictions',
        'capacity_settings',
        'capacity_recommendations',
        'capacity_scenarios',
        'waitlist',
        'slot_offers',
        'hospital_expenses',
        'interventions',
        'prediction_runs',
    ]

    for table in tenant_tables:
        op.drop_constraint(f'fk_{table}_hospital_id', table, type_='foreignkey')
        op.drop_index(f'ix_{table}_hospital_id', table_name=table)
        op.drop_column(table, 'hospital_id')

    op.drop_table('hospital_audit_logs')
    op.drop_table('hospital_partners')
    op.drop_table('hospital_contacts')
    op.drop_table('hospital_management_members')
    op.drop_table('staff_invitations')
    op.drop_table('hospital_memberships')
    op.drop_table('hospital_email_domains')
    op.drop_table('stored_files')
    op.drop_table('hospitals')
