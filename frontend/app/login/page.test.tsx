import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import LoginPage from "./page";
import * as loginActions from "./actions";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders the closed-access login form without any registration or role selector", () => {
    render(<LoginPage />);

    expect(screen.getByText("Sign in to SHAI")).toBeInTheDocument();
    expect(screen.getByText("Authorized hospital staff only.")).toBeInTheDocument();
    expect(screen.getByLabelText("Hospital email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();

    // Verify contact IT line is present
    expect(
      screen.getByText(/Trouble signing in\? Contact your/i)
    ).toBeInTheDocument();

    // Strict requirements: no signup/register links or role pickers
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/register/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("toggles password visibility between password and text type", () => {
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    const toggleButton = screen.getByLabelText("Show password");

    expect(passwordInput.type).toBe("password");

    // Click to reveal password
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");
    expect(screen.getByLabelText("Hide password")).toBeInTheDocument();

    // Click to hide again
    fireEvent.click(screen.getByLabelText("Hide password"));
    expect(passwordInput.type).toBe("password");
    expect(screen.getByLabelText("Show password")).toBeInTheDocument();
  });

  it("displays inactivity notice banner when reason=inactivity query is present", () => {
    mockSearchParams = new URLSearchParams("reason=inactivity");
    render(<LoginPage />);

    expect(
      screen.getByText(/You have been signed out due to inactivity/i)
    ).toBeInTheDocument();
  });

  it("displays generic error message on invalid credentials", async () => {
    vi.spyOn(loginActions, "loginAction").mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Invalid credentials",
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Hospital email"), {
      target: { value: "nurse@hospital.org" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "WrongPass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByText("Incorrect email or password.")
      ).toBeInTheDocument();
    });
  });

  it("displays account locked message on rate limit / locked status", async () => {
    vi.spyOn(loginActions, "loginAction").mockResolvedValueOnce({
      ok: false,
      status: 423,
      message: "account_locked",
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Hospital email"), {
      target: { value: "nurse@hospital.org" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Pass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Too many failed attempts. This account is temporarily locked/i)
      ).toBeInTheDocument();
    });
  });

  it("displays account inactive message on 403 / inactive response", async () => {
    vi.spyOn(loginActions, "loginAction").mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Account is disabled",
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Hospital email"), {
      target: { value: "nurse@hospital.org" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Pass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByText("This account is inactive. Contact your administrator.")
      ).toBeInTheDocument();
    });
  });

  it("redirects to forced password change if mustChangePassword is true", async () => {
    vi.spyOn(loginActions, "loginAction").mockResolvedValueOnce({
      ok: true,
      role: "front_desk",
      name: "Kasun Silva",
      mustChangePassword: true,
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Hospital email"), {
      target: { value: "nurse@hospital.org" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "TempPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/change-password");
    });
  });
});
