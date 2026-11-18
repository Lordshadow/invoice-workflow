import React from 'react';

export const LiquidBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Top-Left Large Soft Iridescent Sphere (Matches Image) */}
      <div 
        className="liquid-sphere-soft orb-float-1 w-[380px] h-[380px] -top-24 -left-20"
        style={{ opacity: 0.85 }}
      />

      {/* Top-Center Floating Cyan/Blue Sphere */}
      <div 
        className="liquid-sphere-large orb-float-2 w-[180px] h-[180px] -top-16 left-1/2 -translate-x-1/2"
        style={{ opacity: 0.9 }}
      />

      {/* Top-Right Giant Glossy Iridescent Bubble with Rim Reflection (Iconic in Image) */}
      <div 
        className="liquid-sphere-large orb-float-3 w-[460px] h-[460px] -top-20 -right-24"
        style={{ opacity: 0.95 }}
      />

      {/* Mid-Right Floating Translucent Blue Orb */}
      <div 
        className="liquid-sphere-soft orb-float-1 w-[260px] h-[260px] top-1/2 -right-16"
        style={{ opacity: 0.8 }}
      />

      {/* Bottom-Left Soft Lavender Ambient Mesh */}
      <div 
        className="liquid-sphere-soft orb-float-2 w-[420px] h-[420px] -bottom-32 -left-20"
        style={{ opacity: 0.7 }}
      />

      {/* Small floating glass droplets (scattered like in image) */}
      <div 
        className="liquid-sphere-large w-7 h-7 top-24 left-[34%] opacity-85"
      />
      <div 
        className="liquid-sphere-large w-5 h-5 bottom-[28%] left-14 opacity-75"
      />
      <div 
        className="liquid-sphere-large w-6 h-6 top-[42%] right-[14%] opacity-80"
      />
    </div>
  );
};
