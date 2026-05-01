import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { hasSignedUpBefore } from "../lib/auth-storage";

/**
 * Auto-routes to /signup for first-time visitors and /login for returning ones,
 * based on a localStorage flag set after the first successful sign-in.
 */
export default function Welcome() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(hasSignedUpBefore() ? "/login" : "/signup", { replace: true });
  }, [navigate]);
  return null;
}
