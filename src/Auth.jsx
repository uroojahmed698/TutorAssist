
import { useState } from "react";
import { supabase } from "./supabase";
import "./Auth.css";

export default function Auth({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.session) {
          onLogin(data.session);
        } else {
          setMessage(
            "Account created! Check your email to confirm your account, then log in."
          );
          setIsSignup(false);
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) throw error;
        onLogin(data.session);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Tutor Assist</h1>
        <p className="auth-subtitle">
          {isSignup
            ? "Create your tutor account"
            : "Welcome back, tutor!"}
        </p>

        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete={
            isSignup ? "new-password" : "current-password"
          }
          minLength={8}
          required
        />

        {message && <p className="auth-message">{message}</p>}

        <button type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : isSignup
              ? "Create account"
              : "Log in"}
        </button>

        <p className="auth-switch">
          {isSignup
            ? "Already have an account?"
            : "New to Tutor Assist?"}{" "}
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setIsSignup(!isSignup);
              setMessage("");
            }}
          >
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
      </form>
    </main>
  );
}
