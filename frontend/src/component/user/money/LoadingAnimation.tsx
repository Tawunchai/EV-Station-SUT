import React from "react";
import { FaSpinner } from "react-icons/fa";

const LoadingAnimation: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full py-12">
    <FaSpinner className="animate-spin text-4xl text-white mb-4" />
    <span className="text-lg text-white font-medium">Checking the slip....</span>
  </div>
);

export default LoadingAnimation;
