export function beginMainSignIn() {
  const returnTo = ['/', '/manage', '/affiliate'].includes(window.location.pathname) ? window.location.pathname : '/';
  window.location.replace(`/api/v1/auth/login?${new URLSearchParams({ returnTo })}`);
}
