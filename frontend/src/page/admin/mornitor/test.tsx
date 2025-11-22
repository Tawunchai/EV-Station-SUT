import React, { useEffect, useState } from "react";
import { connectOcppSocket } from "../../../services";

interface MessageLog {
  id: number;
  raw: string;
}

const Test: React.FC = () => {
  const [messages, setMessages] = useState<MessageLog[]>([]);

  useEffect(() => {
    const ws = connectOcppSocket((data: any) => {
      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, raw: JSON.stringify(data, null, 2) },
      ]);
    });

    return () => ws.close();
  }, []);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-semibold text-blue-700 mb-4">
        ⚡ OCPP Realtime Test
      </h1>
      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-gray-400">Waiting for EV charger data...</p>
        ) : (
          messages.map((msg) => (
            <pre
              key={msg.id}
              className="bg-white rounded-lg shadow p-4 border border-gray-200 overflow-x-auto"
            >
              {msg.raw}
            </pre>
          ))
        )}
      </div>
    </div>
  );
};

export default Test;