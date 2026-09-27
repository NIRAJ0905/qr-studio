
import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import "./App.css";

const qrTypes = ["URL", "Text", "Email", "Phone", "Wi-Fi"];

const presets = [
  {
    name: "Classic",
    fg: "#111827",
    bg: "#ffffff",
    dots: "square"
  },
  {
    name: "Ocean",
    fg: "#1d4ed8",
    bg: "#eff6ff",
    dots: "rounded"
  },
  {
    name: "Forest",
    fg: "#166534",
    bg: "#f0fdf4",
    dots: "classy-rounded"
  },
  {
    name: "Purple",
    fg: "#6d28d9",
    bg: "#faf5ff",
    dots: "extra-rounded"
  },
  {
    name: "Midnight",
    fg: "#ffffff",
    bg: "#111827",
    dots: "rounded"
  },
  {
    name: "Sunset",
    fg: "#9a3412",
    bg: "#fff7ed",
    dots: "classy"
  }
];

// Wi-Fi QR codes use a special text format.
// Escape characters that have special meanings.
function escapeWifi(value) {
  return value.replace(/([\\;,:"'])/g, "\\$1");
}

function validateQR(type, input, wifiSecurity, wifiPassword) {
  const value = input.trim();

  if (!value) {
    return "Please enter the required information.";
  }

  switch (type) {
    case "URL":
      try {
        const url = new URL(value);

        if (!["http:", "https:"].includes(url.protocol)) {
          return "Please use an HTTP or HTTPS website URL.";
        }

        if (!url.hostname.includes(".")) {
          return "Please enter a valid website address.";
        }
      } catch {
        return "Enter a complete URL, such as https://google.com";
      }
      break;

    case "Text":
      if (value.length > 1000) {
        return "Please keep your message under 1000 characters.";
      }
      break;

    case "Email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Please enter a valid email address.";
      }
      break;

    case "Phone":
      if (!/^\+?[0-9\s()-]{7,20}$/.test(value)) {
        return "Please enter a valid phone number.";
      }
      break;

    case "Wi-Fi":
      if (wifiSecurity !== "nopass" && !wifiPassword) {
        return "Please enter your Wi-Fi password.";
      }
      break;

    default:
      return "Unsupported QR code type.";
  }

  return "";
}

function getLuminance(hex) {
  const rgb = [1, 3, 5].map((position) => {
    const channel = parseInt(
      hex.slice(position, position + 2),
      16
    ) / 255;

    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  return (
    0.2126 * rgb[0] +
    0.7152 * rgb[1] +
    0.0722 * rgb[2]
  );
}

function getContrastRatio(foreground, background) {
  const first = getLuminance(foreground);
  const second = getLuminance(background);

  return (
    (Math.max(first, second) + 0.05) /
    (Math.min(first, second) + 0.05)
  );
}

const HISTORY_KEY = "qr-studio-history-v1";
const MAX_HISTORY = 10;

function readHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    // Never restore Wi-Fi credentials from history.
    return parsed
      .filter(
        (item) =>
          item &&
          item.type !== "Wi-Fi" &&
          ["URL", "Text", "Email", "Phone"].includes(item.type) &&
          typeof item.input === "string"
      )
      .slice(0, MAX_HISTORY);
  } catch (error) {
    console.error("Unable to read QR history:", error);
    return [];
  }
}

function App() {
  const [type, setType] = useState("URL");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState(readHistory);
  const [historyMessage, setHistoryMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [qrReady, setQrReady] = useState(false);

  // Additional fields for email and Wi-Fi.
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiSecurity, setWifiSecurity] = useState("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);

  // QR customization.
  const [foreground, setForeground] = useState("#111827");
  const [background, setBackground] = useState("#ffffff");
  const [size, setSize] = useState(250);
  const [margin, setMargin] = useState(10);
  const [correction, setCorrection] = useState("M");
  const [dotStyle, setDotStyle] = useState("square");
  const [cornerStyle, setCornerStyle] = useState("square");

  const qrContainer = useRef(null);
  const qrInstance = useRef(null);

  // Convert the selected form into QR-compatible data.
  function getQRData() {
    const value = input.trim();

    if (!value) return "";

    switch (type) {
      case "URL":
        return value;

      case "Text":
        return input;

      case "Email": {
        const params = new URLSearchParams();

        if (subject) params.set("subject", subject);
        if (message) params.set("body", message);

        const query = params.toString();

        return `mailto:${value}${query ? "?" + query : ""}`;
      }

      case "Phone":
        return `tel:${value.replace(/[\s()-]/g, "")}`;

      case "Wi-Fi": {
        const ssid = escapeWifi(input);
        const hidden = wifiHidden ? "true" : "false";

        if (wifiSecurity === "nopass") {
          return `WIFI:T:nopass;S:${ssid};H:${hidden};;`;
        }

        const password = escapeWifi(wifiPassword);

        return (
          `WIFI:T:${wifiSecurity};` +
          `S:${ssid};` +
          `P:${password};` +
          `H:${hidden};;`
        );
      }

      default:
        return "";
    }
  }

  const validationError = validateQR(
    type,
    input,
    wifiSecurity,
    wifiPassword
  );

  const qrData = validationError ? "" : getQRData();
  const contrastRatio = getContrastRatio(
    foreground,
    background
  );

  const scanWarnings = [];

  if (contrastRatio < 4.5) {
    scanWarnings.push(
      "Low color contrast. Try a darker foreground " +
      "and a lighter background."
    );
  }

  if (
    getLuminance(foreground) >
    getLuminance(background)
  ) {
    scanWarnings.push(
      "Light dots on a dark background may not " +
      "scan reliably with every QR scanner."
    );
  }

  if (margin < 10) {
    scanWarnings.push(
      "Your QR margin may be too small. " +
      "Increase it to leave more clear space."
    );
  }

  if (size < 200) {
    scanWarnings.push(
      "Small QR codes may be difficult to scan, " +
      "especially when they contain a lot of data."
    );
  }

  // Create the QR code once.
  useEffect(() => {
    const qr = new QRCodeStyling({
      width: 250,
      height: 250,
      type: "canvas",
      data: "QR Studio",
      margin: 10,
      qrOptions: {
        errorCorrectionLevel: "M"
      },
      dotsOptions: {
        color: "#111827",
        type: "square"
      },
      backgroundOptions: {
        color: "#ffffff"
      }
    });

    qrInstance.current = qr;

    if (qrContainer.current) {
      qr.append(qrContainer.current);
    }

    return () => {
      if (qrContainer.current) {
        qrContainer.current.replaceChildren();
      }
      qrInstance.current = null;
    };
  }, []);

  // Update the QR whenever its data or settings change.
  useEffect(() => {
    let cancelled = false;

    async function updateQR() {
      setQrReady(false);
      setQrError("");
      setDownloadMessage("");

      if (!qrInstance.current || !qrData) {
        setIsGenerating(false);
        return;
      }

      setIsGenerating(true);

      try {
        await qrInstance.current.update({
          width: size,
          height: size,
          data: qrData,
          margin: margin,
          qrOptions: {
            errorCorrectionLevel: correction
          },
          dotsOptions: {
            color: foreground,
            type: dotStyle
          },
          cornersSquareOptions: {
            color: foreground,
            type: cornerStyle
          },
          cornersDotOptions: {
            color: foreground,
            type: "square"
          },
          backgroundOptions: {
            color: background
          }
        });

        if (!cancelled) {
          setQrReady(true);
        }
      } catch (error) {
        console.error("QR generation failed:", error);

        if (!cancelled) {
          setQrError(
            "Unable to generate this QR code. " +
            "Try reducing the content or changing your settings."
          );
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    }

    updateQR();

    return () => {
      cancelled = true;
    };
  }, [
    qrData,
    size,
    margin,
    correction,
    foreground,
    background,
    dotStyle,
    cornerStyle
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(history)
      );
    } catch (error) {
      console.error("Unable to save QR history:", error);

      setHistoryMessage(
        "History could not be saved. Browser storage may be unavailable."
      );
    }
  }, [history]);

  useEffect(() => {
    if (!qrData || validationError || type === "Wi-Fi") {
      return;
    }

    // Wait until the user has finished typing.
    const timer = setTimeout(() => {
      const newEntry = {
        id: crypto.randomUUID(),
        type,
        input,
        subject: type === "Email" ? subject : "",
        message: type === "Email" ? message : "",
        foreground,
        background,
        size,
        margin,
        correction,
        dotStyle,
        cornerStyle,
        savedAt: new Date().toISOString()
      };

      setHistory((previous) => {
        // Do not create duplicates for identical content
        // and identical design settings.
        const matchingEntry = previous.find(
          (item) =>
            item.type === newEntry.type &&
            item.input === newEntry.input &&
            item.subject === newEntry.subject &&
            item.message === newEntry.message &&
            item.foreground === newEntry.foreground &&
            item.background === newEntry.background &&
            item.size === newEntry.size &&
            item.margin === newEntry.margin &&
            item.correction === newEntry.correction &&
            item.dotStyle === newEntry.dotStyle &&
            item.cornerStyle === newEntry.cornerStyle
        );

        if (matchingEntry) {
          return previous;
        }

        return [newEntry, ...previous].slice(0, MAX_HISTORY);
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    qrData,
    validationError,
    type,
    input,
    subject,
    message,
    foreground,
    background,
    size,
    margin,
    correction,
    dotStyle,
    cornerStyle
  ]);

  function applyPreset(preset) {
    setForeground(preset.fg);
    setBackground(preset.bg);
    setDotStyle(preset.dots);
    setCornerStyle(
      preset.dots === "square" ? "square" : "extra-rounded"
    );
  }

  function changeType(newType) {
    setType(newType);
    setInput("");
    setSubject("");
    setMessage("");
    setWifiPassword("");
    setWifiSecurity("WPA");
    setWifiHidden(false);
  }

  function getInputLabel() {
    switch (type) {
      case "URL": return "Website URL";
      case "Text": return "Your Text";
      case "Email": return "Email Address";
      case "Phone": return "Phone Number";
      case "Wi-Fi": return "Network Name (SSID)";
      default: return "Content";
    }
  }

  function getPlaceholder() {
    switch (type) {
      case "URL": return "https://example.com";
      case "Text": return "Enter your message";
      case "Email": return "hello@example.com";
      case "Phone": return "+91 9876543210";
      case "Wi-Fi": return "My Home Wi-Fi";
      default: return "";
    }
  }

  function saveCurrentQR() {
    if (!qrData || validationError || !qrReady) {
      setHistoryMessage(
        "Generate a valid QR code before saving."
      );
      return;
    }

    if (type === "Wi-Fi") {
      setHistoryMessage(
        "Wi-Fi QR codes are not saved to protect passwords."
      );
      return;
    }

    const newEntry = {
      id: crypto.randomUUID(),
      type,
      input,
      subject: type === "Email" ? subject : "",
      message: type === "Email" ? message : "",
      foreground,
      background,
      size,
      margin,
      correction,
      dotStyle,
      cornerStyle,
      savedAt: new Date().toISOString()
    };

    setHistory((previous) => {
      const withoutDuplicate = previous.filter(
        (item) =>
          !(
            item.type === newEntry.type &&
            item.input === newEntry.input &&
            item.subject === newEntry.subject &&
            item.message === newEntry.message
          )
      );

      return [
        newEntry,
        ...withoutDuplicate
      ].slice(0, MAX_HISTORY);
    });

    setHistoryMessage("QR code saved to recent history.");
  }

  function restoreQR(item) {
    // Only restore supported, non-Wi-Fi entries.
    if (
      !item ||
      !["URL", "Text", "Email", "Phone"].includes(item.type)
    ) {
      return;
    }

    setType(item.type);
    setInput(item.input);
    setSubject(item.subject || "");
    setMessage(item.message || "");

    setForeground(item.foreground);
    setBackground(item.background);
    setSize(item.size);
    setMargin(item.margin);
    setCorrection(item.correction);
    setDotStyle(item.dotStyle || "square");
    setCornerStyle(item.cornerStyle || "square");

    setHistoryMessage("QR code restored successfully.");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function deleteHistoryItem(id) {
    setHistory((previous) =>
      previous.filter((item) => item.id !== id)
    );

    setHistoryMessage("QR code removed from history.");
  }

  function clearHistory() {
    const confirmed = window.confirm(
      "Are you sure you want to delete all recent QR codes?"
    );

    if (!confirmed) return;

    setHistory([]);
    setHistoryMessage("All recent QR codes deleted.");
  }

  async function handleDownload() {
    if (
      !qrInstance.current ||
      !qrData ||
      !qrReady ||
      isGenerating ||
      isDownloading
    ) {
      return;
    }

    setIsDownloading(true);
    setDownloadMessage("");
    setQrError("");

    try {
      // Confirm that the preview canvas exists.
      const canvas = qrContainer.current?.querySelector("canvas");

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("QR preview is not ready.");
      }

      // Generate the PNG from the same QR instance
      // used to render the preview.
      await qrInstance.current.download({
        name: `qr-studio-${type.toLowerCase()}`,
        extension: "png"
      });

      setDownloadMessage(
        "PNG download started! Check your Downloads folder."
      );
    } catch (error) {
      console.error("PNG download failed:", error);

      setQrError(
        "Could not download the QR code. " +
        "Please try again or refresh the page."
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-icon">▦</div>
          <span>QR Studio</span>
        </div>
        <span className="header-badge">GDG Project</span>
      </header>

      <main className="container">
        <div className="hero">
          <span className="eyebrow">QR CODE DESIGNER</span>
          <h1>Create your perfect QR code</h1>
          <p>
            Generate and customize QR codes for
            websites, messages, email, phone and Wi-Fi.
          </p>
        </div>

        <div className="workspace">
          <section className="panel">
            <div className="section-heading">
              <span className="step-number">01</span>
              <h2>Enter your content</h2>
            </div>

            <label className="field-label">
              QR Code Type
            </label>

            <div className="type-grid">
              {qrTypes.map((item) => (
                <button
                  key={item}
                  className={
                    type === item
                      ? "type-button active"
                      : "type-button"
                  }
                  onClick={() => changeType(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label
              className="field-label"
              htmlFor="qr-input"
            >
              {getInputLabel()}
            </label>

            {type === "Text" ? (
              <textarea
                id="qr-input"
                className="text-input"
                rows="4"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={getPlaceholder()}
              />
            ) : (
              <input
                id="qr-input"
                className="text-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={getPlaceholder()}
              />
            )}

            {type === "Email" && (
              <>
                <label className="field-label">
                  Subject (optional)
                </label>
                <input
                  className="text-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                />

                <label className="field-label">
                  Message (optional)
                </label>
                <textarea
                  className="text-input"
                  rows="3"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Your email message"
                />
              </>
            )}

            {type === "Wi-Fi" && (
              <>
                <label className="field-label">
                  Security Type
                </label>
                <select
                  className="select-input"
                  value={wifiSecurity}
                  onChange={(e) =>
                    setWifiSecurity(e.target.value)
                  }
                >
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">No Password</option>
                </select>

                {wifiSecurity !== "nopass" && (
                  <>
                    <label className="field-label">
                      Wi-Fi Password
                    </label>
                    <input
                      className="text-input"
                      type="password"
                      value={wifiPassword}
                      onChange={(e) =>
                        setWifiPassword(e.target.value)
                      }
                      placeholder="Enter network password"
                    />
                  </>
                )}

                <label className="wifi-checkbox">
                  <input
                    type="checkbox"
                    checked={wifiHidden}
                    onChange={(e) =>
                      setWifiHidden(e.target.checked)
                    }
                  />
                  Hidden network
                </label>
              </>
            )}

            {input.trim() && validationError ? (
              <p className="validation-error" role="alert">
                ⚠ {validationError}
              </p>
            ) : (
              <p className="helper-text">
                Your QR code updates automatically when
                you enter valid information.
              </p>
            )}

            <div className="section-heading second-heading">
              <span className="step-number">02</span>
              <h2>Customize your design</h2>
            </div>

            <label className="field-label">
              Quick Presets
            </label>

            <div className="presets">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  className="preset-button"
                  onClick={() => applyPreset(preset)}
                >
                  <span
                    className="preset-color"
                    style={{
                      backgroundColor: preset.fg
                    }}
                  />
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="color-grid">
              <div>
                <label className="field-label">
                  Foreground
                </label>
                <input
                  className="color-input"
                  type="color"
                  value={foreground}
                  onChange={(e) =>
                    setForeground(e.target.value)
                  }
                />
              </div>

              <div>
                <label className="field-label">
                  Background
                </label>
                <input
                  className="color-input"
                  type="color"
                  value={background}
                  onChange={(e) =>
                    setBackground(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="slider-group">
              <label className="slider-label">
                QR Size <strong>{size}px</strong>
              </label>
              <input
                type="range"
                min="150"
                max="400"
                step="10"
                value={size}
                onChange={(e) =>
                  setSize(Number(e.target.value))
                }
              />
            </div>

            <div className="slider-group">
              <label className="slider-label">
                Margin <strong>{margin}px</strong>
              </label>
              <input
                type="range"
                min="0"
                max="30"
                value={margin}
                onChange={(e) =>
                  setMargin(Number(e.target.value))
                }
              />
            </div>

            <label className="field-label">
              Error Correction
            </label>

            <select
              className="select-input"
              value={correction}
              onChange={(e) =>
                setCorrection(e.target.value)
              }
            >
              <option value="L">Low (L)</option>
              <option value="M">Medium (M)</option>
              <option value="Q">Quartile (Q)</option>
              <option value="H">High (H)</option>
            </select>

            <label className="field-label">
              QR Dot Pattern
            </label>

            <select
              className="select-input"
              value={dotStyle}
              onChange={(e) => setDotStyle(e.target.value)}
            >
              <option value="square">Square</option>
              <option value="rounded">Rounded</option>
              <option value="dots">Dots</option>
              <option value="classy">Classy</option>
              <option value="classy-rounded">Classy Rounded</option>
              <option value="extra-rounded">Extra Rounded</option>
            </select>

            <label className="field-label">
              Corner Style
            </label>

            <select
              className="select-input"
              value={cornerStyle}
              onChange={(e) => setCornerStyle(e.target.value)}
            >
              <option value="square">Square</option>
              <option value="dot">Dot</option>
              <option value="extra-rounded">Extra Rounded</option>
            </select>
          </section>

          <section className="panel preview-panel">
            <div className="section-heading">
              <span className="step-number">03</span>
              <h2>Live Preview</h2>
            </div>

            <p className="preview-description">
              Your QR code is generated in real time.
            </p>

            <div className="preview-area">
              <div
                ref={qrContainer}
                className="qr-output"
                style={{
                  display: qrData ? "flex" : "none"
                }}
              />

              {!qrData && (
                <div className="empty-preview">
                  <span className="empty-icon">▦</span>
                  <p>Enter content to generate a QR code</p>
                </div>
              )}
            </div>

            {scanWarnings.length > 0 && (
              <div className="scan-warning">
                <strong>⚠ Scan Reliability Warning</strong>

                {scanWarnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
              </div>
            )}

            {scanWarnings.length === 0 && qrData && (
              <div className="scan-success">
                ✓ No obvious design issues detected.
                Test the QR code with your phone.
              </div>
            )}

            <div className="preview-info">
              <span>Type: {type}</span>
              <span>Size: {size} × {size}</span>
            </div>

            <button
              className="download-button"
              onClick={handleDownload}
              disabled={
                !qrData ||
                !qrReady ||
                isGenerating ||
                isDownloading ||
                Boolean(qrError)
              }
            >
              {isDownloading
                ? "Downloading..."
                : isGenerating
                ? "Generating..."
                : "↓ Download PNG"}
            </button>

            {type !== "Wi-Fi" && (
              <button
                className="save-button"
                onClick={saveCurrentQR}
                disabled={!qrData || !qrReady || isGenerating}
              >
                Save to Recent History
              </button>
            )}

            {qrError && (
              <div className="download-error" role="alert">
                ⚠ {qrError}
              </div>
            )}

            {downloadMessage && (
              <div className="download-success" role="status">
                ✓ {downloadMessage}
              </div>
            )}

            {isGenerating && (
              <p className="generation-status" role="status">
                Updating your QR code...
              </p>
            )}

            <p className="preview-note">
              Scan your QR code with your phone to test it.
            </p>
          </section>
        </div>

        <section className="history-section">
          <div className="history-header">
            <div>
              <h2>Recent QR Codes</h2>
              <p>
                Reuse your previously generated QR codes.
                Up to 10 entries are saved in this browser.
              </p>
            </div>

            {history.length > 0 && (
              <button
                className="clear-history-button"
                onClick={clearHistory}
              >
                Clear All
              </button>
            )}
          </div>

          {historyMessage && (
            <p className="history-message" role="status">
              {historyMessage}
            </p>
          )}

          {history.length === 0 ? (
            <div className="history-empty">
              <span className="history-empty-icon">▦</span>
              <h3>No recent QR codes yet</h3>
              <p>
                Generate a URL, text, email or phone QR code.
                Your recent designs will appear here.
              </p>
            </div>
          ) : (
            <div className="history-grid">
              {history.map((item) => (
                <div className="history-card" key={item.id}>
                  <div
                    className="history-card-icon"
                    style={{
                      backgroundColor: item.foreground
                    }}
                  >
                    ▦
                  </div>

                  <div className="history-card-content">
                    <span className="history-type">
                      {item.type}
                    </span>

                    <p className="history-value">
                      {item.input}
                    </p>

                    <span className="history-date">
                      {new Date(item.savedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="history-actions">
                    <button
                      className="restore-button"
                      onClick={() => restoreQR(item)}
                    >
                      Restore
                    </button>

                    <button
                      className="delete-button"
                      onClick={() => deleteHistoryItem(item.id)}
                      aria-label={`Delete ${item.type} QR code`}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="history-privacy">
            History is stored locally in this browser.
            Wi-Fi passwords are never saved.
            Avoid generating sensitive content on shared devices.
          </p>
        </section>

        <footer className="footer">
          Built for GDG on Campus SRM Recruitment 2026 by Niraj Pingale
        </footer>
      </main>
    </div>
  );
}

export default App;