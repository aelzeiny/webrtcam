import React from 'react';

const QualityIndicator = ({ quality }) => {
  const getIndicatorStyle = () => {
    switch (quality) {
      case 'excellent':
        return {
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          color: 'var(--success-color)'
        };
      case 'good':
        return {
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          color: 'var(--success-color)'
        };
      case 'fair':
        return {
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          color: '#EAAC0D'
        };
      case 'poor':
        return {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--error-color)'
        };
      default:
        return {
          backgroundColor: 'rgba(100, 116, 139, 0.1)',
          color: 'var(--text-secondary)'
        };
    }
  };

  const getIndicatorText = () => {
    switch (quality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'fair':
        return 'Fair';
      case 'poor':
        return 'Poor';
      default:
        return 'Unknown';
    }
  };

  return (
    <div 
      className="quality-indicator"
      style={{
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '500',
        ...getIndicatorStyle()
      }}
    >
      {getIndicatorText()}
    </div>
  );
};

export default QualityIndicator;