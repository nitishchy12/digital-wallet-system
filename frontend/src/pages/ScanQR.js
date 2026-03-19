import React, { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const ScanQR = () => {
  const navigate = useNavigate();
  const qrRef = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    // Ensure DOM element exists
    if (!qrRef.current) return;

    const html5QrCode = new Html5Qrcode("qr-reader");
    scannerRef.current = html5QrCode;

    html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          try {
            html5QrCode.stop();

            const qrData = JSON.parse(decodedText);

            // Basic validation
            if (qrData.type !== "WALLET_QR" || !qrData.email) {
              toast.error("Invalid QR Code");
              return;
            }

            toast.success("QR scanned successfully");

            // Redirect to Send Money with prefill
            navigate("/send", {
              state: {
                email: qrData.email,
                name: qrData.name,
                fromQR: true
              }
            });
          } catch (err) {
            toast.error("Invalid QR Code format");
          }
        },
        () => {} // ignore scan errors
      )
      .catch(() => {
        toast.error("Camera permission denied");
      });

    // 🔴 CLEANUP (THIS FIXES 90% QR BUGS)
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [navigate]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Scan QR Code</h2>

      {/* THIS DIV IS REQUIRED */}
      <div
        id="qr-reader"
        ref={qrRef}
        style={{ width: "300px", margin: "0 auto" }}
      />
    </div>
  );
};

export default ScanQR;
  
