import { useState } from 'react';

interface ConsentModalProps {
  onConsent: () => void;
}

export function ConsentModal({ onConsent }: ConsentModalProps) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>⚠️ Screen Capture Consent</h2>

        <div className="modal-content">
          <p>
            <strong>This application will capture your screen</strong> through OBS Virtual Camera
            and send it to Overshoot for AI analysis.
          </p>

          <div className="warning-box">
            <h3>Before you start:</h3>
            <ul>
              <li>Close or minimize windows with sensitive information</li>
              <li>Hide password managers and private messages</li>
              <li>Disable notifications that may contain private content</li>
              <li>Be aware that everything visible will be analyzed</li>
            </ul>
          </div>

          <p className="small">
            Vision data is sent to Overshoot's servers for processing.
            Review their privacy policy for data handling details.
          </p>
        </div>

        <div className="consent-checkbox">
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>I understand my screen is being captured and analyzed</span>
          </label>
        </div>

        <button
          className="consent-button"
          disabled={!checked}
          onClick={onConsent}
        >
          I Agree and Start
        </button>
      </div>
    </div>
  );
}
