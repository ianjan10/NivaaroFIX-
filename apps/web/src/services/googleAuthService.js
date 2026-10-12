// Service for 100% Real Direct Google OAuth 2.0 Integration with Google Identity Services (GIS)

export function getStoredGoogleClientId() {
  return (
    localStorage.getItem('nivaaro_google_client_id') ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    ''
  ).trim();
}

export function setStoredGoogleClientId(clientId) {
  if (clientId) {
    localStorage.setItem('nivaaro_google_client_id', clientId.trim());
  } else {
    localStorage.removeItem('nivaaro_google_client_id');
  }
}

/**
 * Triggers the official Google OAuth 2.0 account selection popup directly from Google.
 * Retrieves real user information directly from Google's UserInfo API and syncs with PostgreSQL.
 */
export async function initiateDirectGoogleOAuth({
  clientId,
  role = 'customer',
  onStart,
  onSuccess,
  onError
}) {
  const effectiveClientId = clientId || getStoredGoogleClientId();

  if (!effectiveClientId) {
    if (onError) {
      onError({
        code: 'NO_CLIENT_ID',
        message: 'Please enter your Google OAuth Client ID to connect directly with your real Google account.'
      });
    }
    return false;
  }

  // Ensure Google Identity Services SDK is loaded
  if (!window.google?.accounts?.oauth2) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    await new Promise((resolve) => {
      script.onload = resolve;
      setTimeout(resolve, 1500);
    });
  }

  if (!window.google?.accounts?.oauth2) {
    if (onError) {
      onError({
        code: 'SDK_NOT_LOADED',
        message: 'Could not load Google Identity Services SDK. Please check your internet connection.'
      });
    }
    return false;
  }

  if (onStart) onStart();

  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: effectiveClientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.error('Google OAuth Error Response:', tokenResponse);
          if (onError) {
            onError({
              code: tokenResponse.error,
              message: tokenResponse.error_description || 'Google sign-in was cancelled or encountered an error.'
            });
          }
          return;
        }

        if (tokenResponse.access_token) {
          try {
            // Fetch real user info directly from Google OAuth2 API
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: {
                Authorization: `Bearer ${tokenResponse.access_token}`
              }
            });

            if (!userInfoRes.ok) {
              throw new Error(`Google API returned status ${userInfoRes.status}`);
            }

            const realGoogleProfile = await userInfoRes.json();
            console.log('✅ Real Google Profile verified from Google API:', realGoogleProfile);

            // Persist real user info to PostgreSQL backend
            const backendRes = await fetch('http://localhost:5000/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role,
                profile: {
                  name: realGoogleProfile.name || `${realGoogleProfile.given_name || ''} ${realGoogleProfile.family_name || ''}`.trim(),
                  email: realGoogleProfile.email,
                  picture: realGoogleProfile.picture,
                  sub: realGoogleProfile.sub
                }
              })
            });

            const backendData = await backendRes.json();
            if (backendData.success) {
              const authData = role === 'agent' ? backendData.agent : backendData.user;
              if (onSuccess) onSuccess(authData);
            } else {
              throw new Error(backendData.message || 'Failed to persist user to PostgreSQL database.');
            }
          } catch (fetchErr) {
            console.error('Error fetching Google UserInfo:', fetchErr);
            if (onError) {
              onError({
                code: 'USERINFO_FETCH_FAILED',
                message: fetchErr.message || 'Failed to retrieve profile details from Google.'
              });
            }
          }
        }
      },
      error_callback: (err) => {
        console.error('Google Token Client Error:', err);
        if (onError) {
          onError({
            code: 'TOKEN_CLIENT_ERROR',
            message: err.message || 'Failed to initialize Google OAuth popup.'
          });
        }
      }
    });

    tokenClient.requestAccessToken();
    return true;
  } catch (err) {
    console.error('Error launching Google OAuth:', err);
    if (onError) {
      onError({
        code: 'LAUNCH_ERROR',
        message: err.message || 'Could not launch Google authentication.'
      });
    }
    return false;
  }
}
