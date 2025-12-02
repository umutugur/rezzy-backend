import React from "react";

export type EmptyStateProps = {
  icon?: string;
  title: string;
  text?: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = "✨", title, text }) => {
  return (
    <div className="rezvix-empty">
      <div className="rezvix-empty__icon">{icon}</div>
      <div className="rezvix-empty__title">{title}</div>
      {text && <div className="rezvix-empty__text">{text}</div>}
    </div>
  );
};