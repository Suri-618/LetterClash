export default function AuthPage({
  authMode,
  setAuthMode,
  authUsername,
  setAuthUsername,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authBusy,
  authError,
  submitAuth,
  onBack,
}) {
  const isRegister = authMode === "register";

  return (
    <main className="auth-page">
      <button
        type="button"
        className="link-button"
        onClick={onBack}
      >
        ← Back to Home
      </button>

      <section className="auth-card">
        <div className="brand-mark">LC</div>

        <h1>{isRegister ? "Create Your Account" : "Welcome Back"}</h1>
        <p>
          {isRegister
            ? "Join the arena and challenge your rivals."
            : "Sign in and get ready to battle."}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={!isRegister ? "active" : ""}
            onClick={() => setAuthMode("login")}
          >
            Login
          </button>

          <button
            type="button"
            className={isRegister ? "active" : ""}
            onClick={() => setAuthMode("register")}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={submitAuth}>
          {isRegister && (
            <>
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                value={authUsername}
                onChange={(event) =>
                  setAuthUsername(event.target.value)
                }
                placeholder="Choose a username"
                autoComplete="username"
                minLength={3}
                maxLength={16}
                required
              />
            </>
          )}

          <label htmlFor="auth-email">Email Address</label>
          <input
            id="auth-email"
            type="email"
            value={authEmail}
            onChange={(event) =>
              setAuthEmail(event.target.value)
            }
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={authPassword}
            onChange={(event) =>
              setAuthPassword(event.target.value)
            }
            placeholder="Enter your password"
            autoComplete={
              isRegister ? "new-password" : "current-password"
            }
            minLength={8}
            required
          />

          {authError && (
            <p className="auth-error">{authError}</p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={authBusy}
          >
            {authBusy
              ? "Please wait..."
              : isRegister
                ? "Create Account"
                : "Login to Play"}
          </button>
        </form>
      </section>
    </main>
  );
}
