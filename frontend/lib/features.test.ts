import { describe, expect, it } from "vitest";

import { deriveFeatures } from "@/lib/features";
import type { Appointment, Patient } from "@/lib/types";

// 2024-01-01 is independently known to be a Monday — used as a fixed anchor
// so expected weekday values below aren't derived from the same code path
// they're verifying.
function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: "patient-1",
    uhid: null,
    full_name: "Test Patient",
    date_of_birth: "1990-04-12",
    gender: null,
    phone: null,
    email: null,
    city: null,
    distance_km: null,
    scholarship: false,
    hypertension: false,
    diabetes: false,
    alcoholism: false,
    handicap: 0,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    patient_id: "patient-1",
    scheduled_day: "2024-01-01",
    appointment_day: "2024-01-03",
    department: null,
    doctor_name: null,
    booking_channel: null,
    payment_mode: null,
    scheduled_time: null,
    queue_number: null,
    ai_action_status: null,
    sms_received: false,
    status: "scheduled",
    no_show: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("deriveFeatures", () => {
  it("computes DayOfWeek using the Monday=0 convention matching pandas .dt.weekday", () => {
    // 2024-01-03 is a Wednesday (Jan 1 = Monday, Jan 2 = Tuesday, Jan 3 = Wednesday)
    const wednesday = deriveFeatures(makePatient(), makeAppointment({ appointment_day: "2024-01-03" }));
    expect(wednesday.DayOfWeek).toBe(2);
    expect(wednesday.IsWeekend).toBe(0);

    // 2024-01-06 is a Saturday
    const saturday = deriveFeatures(makePatient(), makeAppointment({ appointment_day: "2024-01-06" }));
    expect(saturday.DayOfWeek).toBe(5);
    expect(saturday.IsWeekend).toBe(1);

    // 2024-01-07 is a Sunday
    const sunday = deriveFeatures(makePatient(), makeAppointment({ appointment_day: "2024-01-07" }));
    expect(sunday.DayOfWeek).toBe(6);
    expect(sunday.IsWeekend).toBe(1);

    // 2024-01-01 is the Monday itself
    const monday = deriveFeatures(makePatient(), makeAppointment({ appointment_day: "2024-01-01" }));
    expect(monday.DayOfWeek).toBe(0);
    expect(monday.IsWeekend).toBe(0);
  });

  it("computes DaysAhead as the gap between scheduled_day and appointment_day", () => {
    const features = deriveFeatures(
      makePatient(),
      makeAppointment({ scheduled_day: "2024-01-01", appointment_day: "2024-01-08" })
    );
    expect(features.DaysAhead).toBe(7);
  });

  it("clips DaysAhead to 0 rather than going negative", () => {
    const features = deriveFeatures(
      makePatient(),
      makeAppointment({ scheduled_day: "2024-01-08", appointment_day: "2024-01-01" })
    );
    expect(features.DaysAhead).toBe(0);
  });

  it("computes Age accounting for whether the birthday has occurred yet this year", () => {
    const beforeBirthday = deriveFeatures(
      makePatient({ date_of_birth: "1990-04-12" }),
      makeAppointment({ appointment_day: "2024-01-03" }) // before April 12
    );
    expect(beforeBirthday.Age).toBe(33);

    const afterBirthday = deriveFeatures(
      makePatient({ date_of_birth: "1990-04-12" }),
      makeAppointment({ appointment_day: "2024-06-01" }) // after April 12
    );
    expect(afterBirthday.Age).toBe(34);

    const onBirthday = deriveFeatures(
      makePatient({ date_of_birth: "1990-04-12" }),
      makeAppointment({ appointment_day: "2024-04-12" }) // exactly on the birthday
    );
    expect(onBirthday.Age).toBe(34);
  });

  it("maps boolean patient flags to 0/1 for the model", () => {
    const allTrue = deriveFeatures(
      makePatient({ scholarship: true, hypertension: true, diabetes: true, alcoholism: true }),
      makeAppointment({ sms_received: true })
    );
    expect(allTrue.Scholarship).toBe(1);
    expect(allTrue.Hipertension).toBe(1);
    expect(allTrue.Diabetes).toBe(1);
    expect(allTrue.Alcoholism).toBe(1);
    expect(allTrue.SMS_received).toBe(1);

    const allFalse = deriveFeatures(makePatient(), makeAppointment());
    expect(allFalse.Scholarship).toBe(0);
    expect(allFalse.Hipertension).toBe(0);
    expect(allFalse.Diabetes).toBe(0);
    expect(allFalse.Alcoholism).toBe(0);
    expect(allFalse.SMS_received).toBe(0);
  });

  it("passes handicap severity through unmodified", () => {
    const features = deriveFeatures(makePatient({ handicap: 3 }), makeAppointment());
    expect(features.Handcap).toBe(3);
  });

  it("extracts Month from the appointment date, not the scheduled date", () => {
    const features = deriveFeatures(
      makePatient(),
      makeAppointment({ scheduled_day: "2024-01-01", appointment_day: "2024-09-15" })
    );
    expect(features.Month).toBe(9);
  });
});
