"""Idempotent backfill script for Prediction Hub data foundation.

1. Ensures departments exist for all distinct specialties/departments in appointments & doctor_sessions.
2. Creates doctors and weekly clinic sessions from distinct doctor_name in existing rows.
3. Sets appointments.doctor_id and clinic_session_id.
4. Merges duplicate patients (same phone + DOB), repointing appointments.
5. Assigns sequential queue_numbers per (doctor, appointment_day) where null or duplicated.
"""
import logging
import uuid
from datetime import time
from sqlalchemy import text
from app.database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_hub")


def run_backfill():
    db = SessionLocal()
    try:
        logger.info("Starting backfill_hub...")

        # 1. Backfill departments from doctor_sessions & appointments
        db.execute(text("""
            INSERT INTO departments (name, model_category, icon, telehealth_ok, active)
            SELECT DISTINCT
                coalesce(trim(specialty), 'General Medicine') as name,
                CASE 
                    WHEN trim(specialty) IN ('Cardiology', 'Dermatology', 'ENT', 'Endocrinology', 'Gastroenterology',
                                            'General Medicine', 'Gynecology', 'Neurology', 'Orthopedics',
                                            'Pediatrics', 'Psychiatry', 'Urology') THEN trim(specialty)
                    ELSE NULL
                END as model_category,
                'stethoscope' as icon,
                false as telehealth_ok,
                true as active
            FROM doctor_sessions
            WHERE specialty IS NOT NULL AND trim(specialty) <> ''
            ON CONFLICT (name) DO NOTHING;
        """))

        # Also from appointments.department
        db.execute(text("""
            INSERT INTO departments (name, model_category, icon, telehealth_ok, active)
            SELECT DISTINCT
                coalesce(trim(department), 'General Medicine') as name,
                CASE 
                    WHEN trim(department) IN ('Cardiology', 'Dermatology', 'ENT', 'Endocrinology', 'Gastroenterology',
                                             'General Medicine', 'Gynecology', 'Neurology', 'Orthopedics',
                                             'Pediatrics', 'Psychiatry', 'Urology') THEN trim(department)
                    ELSE NULL
                END as model_category,
                'stethoscope' as icon,
                false as telehealth_ok,
                true as active
            FROM appointments
            WHERE department IS NOT NULL AND trim(department) <> ''
            ON CONFLICT (name) DO NOTHING;
        """))

        # Default fallback department
        db.execute(text("""
            INSERT INTO departments (name, model_category, icon, telehealth_ok, active)
            VALUES ('General Medicine', 'General Medicine', 'stethoscope', true, true)
            ON CONFLICT (name) DO NOTHING;
        """))

        # 2. Backfill doctors from doctor_sessions and appointments
        db.execute(text("""
            INSERT INTO doctors (id, title, full_name, department_id, active, created_at)
            SELECT 
                gen_random_uuid(),
                'Dr.',
                regexp_replace(trim(ds.doctor_name), '^Dr\\.\\s*', '', 'i'),
                d.id,
                true,
                now()
            FROM (
                SELECT DISTINCT doctor_name, specialty FROM doctor_sessions
                UNION
                SELECT DISTINCT doctor_name, coalesce(department, 'General Medicine') as specialty FROM appointments WHERE doctor_name IS NOT NULL
            ) ds
            JOIN departments d ON d.name = coalesce(trim(ds.specialty), 'General Medicine')
            WHERE NOT EXISTS (
                SELECT 1 FROM doctors doc 
                WHERE lower(doc.full_name) = lower(regexp_replace(trim(ds.doctor_name), '^Dr\\.\\s*', '', 'i'))
            );
        """))

        # 3. Create a weekly session for each doctor if none exists
        # Weekday 3 (Thursday, matching demo day), Evening 17:00-20:00
        db.execute(text("""
            INSERT INTO doctor_clinic_sessions (id, doctor_id, weekday, label, start_time, end_time, room, max_patients, slot_minutes, active)
            SELECT 
                gen_random_uuid(),
                doc.id,
                3, -- Thursday
                'Evening',
                '17:00'::time,
                '20:00'::time,
                coalesce(doc.default_room, 'Room 204'),
                25,
                12,
                true
            FROM doctors doc
            WHERE NOT EXISTS (
                SELECT 1 FROM doctor_clinic_sessions dcs WHERE dcs.doctor_id = doc.id
            );
        """))

        # 4. Link appointments to doctors
        db.execute(text("""
            UPDATE appointments a
            SET doctor_id = doc.id
            FROM doctors doc
            WHERE a.doctor_id IS NULL 
              AND a.doctor_name IS NOT NULL
              AND lower(regexp_replace(trim(a.doctor_name), '^Dr\\.\\s*', '', 'i')) = lower(doc.full_name);
        """))

        # Temporarily nullify queue_number to prevent unique index collision during row-by-row update
        db.execute(text("UPDATE appointments SET queue_number = NULL WHERE source = 'manual';"))

        # Link appointments to session where doctor_id matches
        db.execute(text("""
            UPDATE appointments a
            SET clinic_session_id = dcs.id
            FROM doctor_clinic_sessions dcs
            WHERE a.doctor_id = dcs.doctor_id
              AND a.clinic_session_id IS NULL;
        """))

        # 5. Merge duplicate patients by phone + DOB (repointing appointments)
        db.execute(text("""
            WITH duplicates AS (
                SELECT phone, date_of_birth,
                       (array_agg(id ORDER BY created_at ASC))[1] as canonical_id,
                       array_remove(array_agg(id ORDER BY created_at ASC), (array_agg(id ORDER BY created_at ASC))[1]) as dup_ids
                FROM patients
                WHERE phone IS NOT NULL AND date_of_birth IS NOT NULL
                GROUP BY phone, date_of_birth
                HAVING count(*) > 1
            ),
            flattened AS (
                SELECT canonical_id, unnest(dup_ids) as dup_id FROM duplicates
            )
            UPDATE appointments a
            SET patient_id = f.canonical_id
            FROM flattened f
            WHERE a.patient_id = f.dup_id;
        """))

        # Delete merged duplicate patient rows
        db.execute(text("""
            WITH duplicates AS (
                SELECT phone, date_of_birth,
                       array_remove(array_agg(id ORDER BY created_at ASC), (array_agg(id ORDER BY created_at ASC))[1]) as dup_ids
                FROM patients
                WHERE phone IS NOT NULL AND date_of_birth IS NOT NULL
                GROUP BY phone, date_of_birth
                HAVING count(*) > 1
            ),
            to_delete AS (
                SELECT unnest(dup_ids) as del_id FROM duplicates
            )
            DELETE FROM patients
            WHERE id IN (SELECT del_id FROM to_delete);
        """))

        # 6. Assign sequential queue_numbers per (doctor, appointment_day)
        db.execute(text("""
            WITH numbered AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY doctor_id, appointment_day, clinic_session_id 
                           ORDER BY coalesce(scheduled_time, '09:00'), created_at
                       ) as new_seq
                FROM appointments
                WHERE source = 'manual' AND status <> 'cancelled'
            )
            UPDATE appointments a
            SET queue_number = n.new_seq
            FROM numbered n
            WHERE a.id = n.id;
        """))

        db.commit()
        logger.info("backfill_hub completed successfully.")
    except Exception as e:
        db.rollback()
        logger.error(f"backfill_hub failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_backfill()
