import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import hostelBuildingImg from '../assets/images/hostel-building.jpg';

const REMEMBER_EMAIL_KEY = 'hm_trcc_remembered_email';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginPage: React.FC = () => {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem(REMEMBER_EMAIL_KEY)));
  const [forgotOpen, setForgotOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmedEmail, password, rememberMe);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#F4F4F4]">
      {/* Left Panel (~45% width): Exact Hostel Building Photo + Overlay + Decorative Outlines + Branding */}
      <div className="w-[45%] h-full relative overflow-hidden bg-[#1E2022] shrink-0 select-none">
        <img
          src={hostelBuildingImg}
          alt="HM TRCC Hostel Building"
          className="w-full h-full object-cover object-center"
        />

        {/* Dark bottom overlay for readable white branding */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, rgba(16, 18, 20, 0.86) 0%, rgba(16, 18, 20, 0.48) 28%, rgba(16, 18, 20, 0.08) 56%, transparent 100%)',
          }}
        />

        {/* Thin Decorative Geometric Rounded-Diamond Outlines */}
        <svg
          aria-hidden="true"
          viewBox="0 0 220 220"
          className="absolute -top-2 -right-2 w-[180px] h-[180px] xl:w-[210px] xl:h-[210px] pointer-events-none"
        >
          <rect
            x="78"
            y="-44"
            width="164"
            height="164"
            rx="16"
            fill="none"
            stroke="#DDF58A"
            strokeOpacity="0.85"
            strokeWidth="1.25"
            transform="rotate(42 160 38)"
          />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 180 240"
          className="absolute top-[36%] left-0 w-[130px] h-[220px] xl:w-[155px] xl:h-[250px] pointer-events-none"
        >
          <rect
            x="-98"
            y="42"
            width="152"
            height="152"
            rx="16"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.65"
            strokeWidth="1.25"
            transform="rotate(44 -22 118)"
          />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 220 200"
          className="absolute bottom-0 right-0 w-[180px] h-[160px] xl:w-[210px] xl:h-[185px] pointer-events-none"
        >
          <rect
            x="64"
            y="88"
            width="168"
            height="168"
            rx="16"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.72"
            strokeWidth="1.25"
            transform="rotate(45 148 172)"
          />
        </svg>

        {/* Bottom-left HM TRCC Branding */}
        <div className="absolute left-9 xl:left-11 bottom-9 xl:bottom-11 z-10">
          <div className="w-[42px] h-[5px] rounded-full bg-[#DDF58A] mb-3.5" />
          <h2 className="font-slab text-[36px] xl:text-[42px] font-bold leading-[1.08] tracking-[-0.01em] text-white">
            HM TRCC
          </h2>
          <p className="text-[18px] xl:text-[20px] font-normal leading-[1.35] text-white/90 mt-1.5">
            Hostel Management System
          </p>
        </div>
      </div>

      {/* Right Panel (~55% width): Light Grey Background + Centered White Login Card */}
      <div className="w-[55%] h-full bg-[#F4F4F4] flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-[500px] xl:max-w-[540px] 2xl:max-w-[580px] bg-[#FFFFFF] rounded-[14px] border border-[#EAEAEA] shadow-[0_4px_24px_rgba(0,0,0,0.03)] px-10 py-11 xl:px-12 xl:py-[52px]">
          {/* Top Centered Brand Mark */}
          <div className="flex items-center justify-center gap-3">
            <div className="relative w-7 h-7 flex items-center justify-center" aria-hidden="true">
              <span className="absolute w-[18px] h-[18px] border-[1.75px] border-[#222222] rotate-45 -translate-x-1.5 rounded-[3px]" />
              <span className="absolute w-[16px] h-[16px] bg-[#DDF58A] rotate-45 translate-x-1.5 rounded-[3px]" />
            </div>
            <span className="text-[22px] font-bold tracking-[0.04em] text-[#222222] leading-none">
              HM TRCC
            </span>
          </div>

          {/* Main Card Heading */}
          <h1 className="font-slab text-[28px] xl:text-[30px] font-bold leading-[1.2] text-[#292929] text-center mt-6 mb-8">
            Welcome Back
          </h1>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {error ? (
              <div
                role="alert"
                className="bg-[#D9383A]/10 border border-[#D9383A]/30 text-[#D9383A] rounded-[8px] px-3.5 py-2.5 text-[14px] leading-[1.45]"
              >
                {error}
              </div>
            ) : null}

            {/* Email Address */}
            <div>
              <label
                htmlFor="login-email"
                className="inline-flex items-center gap-2 text-[15px] font-semibold leading-[1.4] text-[#292929] mb-2"
              >
                <Mail className="w-4 h-4 text-[#292929]" strokeWidth={1.9} />
                <span>Email Address</span>
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full h-[46px] px-4 text-[16px] font-normal leading-[1.45] text-[#292929] placeholder:text-[#777777] bg-[#F4F4F4] border border-[#DCDCDC] rounded-[8px] focus:outline-none focus:border-[#292929] focus:bg-[#FFFFFF] transition-colors"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="inline-flex items-center gap-2 text-[15px] font-semibold leading-[1.4] text-[#292929] mb-2"
              >
                <Lock className="w-4 h-4 text-[#292929]" strokeWidth={1.9} />
                <span>Password</span>
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-[46px] pl-4 pr-11 text-[16px] font-normal leading-[1.45] text-[#292929] placeholder:text-[#777777] bg-[#F4F4F4] border border-[#DCDCDC] rounded-[8px] focus:outline-none focus:border-[#292929] focus:bg-[#FFFFFF] transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#292929]/75 hover:text-[#292929] focus:outline-none focus:text-[#292929] p-1"
                >
                  {showPassword ? (
                    <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.9} />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" strokeWidth={1.9} />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="inline-flex items-center gap-2.5 text-[14px] font-normal leading-[1.4] text-[#292929] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-[16px] h-[16px] rounded-[4px] border border-[#C8C8C8] accent-[#222222] cursor-pointer"
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setForgotOpen((prev) => !prev)}
                className="text-[14px] font-medium leading-[1.4] text-[#5F8A6E] hover:text-[#4B7058] focus:outline-none focus:underline"
              >
                Forgot password?
              </button>
            </div>

            {forgotOpen ? (
              <div
                role="status"
                className="bg-[#F4F4F4] border border-[#E9E9E9] text-[#292929] rounded-[8px] px-3.5 py-2.5 text-[14px] leading-[1.45]"
              >
                Self-service password reset is disabled for staff security. Contact the Hostel Super Admin to reset your credentials.
              </div>
            ) : null}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-[48px] mt-1 bg-[#222222] hover:bg-[#333333] disabled:opacity-60 text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
              {!submitting ? <ArrowRight className="w-4 h-4" strokeWidth={2.2} /> : null}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
