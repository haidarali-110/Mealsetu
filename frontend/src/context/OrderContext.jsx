import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '../components/common/Toast';

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [orderState, setOrderState] = useState({
    vendor_id: '',
    selected_day: '',
    menu_type: 'regular', // 'regular' or 'jain'
    selected_plan: '' // 'daily', 'weekly', 'monthly'
  });
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  // Reset on unmount or errors
  useEffect(() => {
    return () => setOrderState({
      vendor_id: '',
      selected_day: '',
      menu_type: 'regular',
      selected_plan: ''
    });
  }, []);

  const updateOrderState = (updates) => {
    setOrderState(prev => ({ ...prev, ...updates }));
  };

  const resetOrder = () => {
    setOrderState({
      vendor_id: '',
      selected_day: '',
      menu_type: 'regular',
      selected_plan: ''
    });
  };

  const value = {
    orderState,
    updateOrderState,
    resetOrder,
    loading,
    setLoading
  };

  return (
    <OrderContext.Provider value={value}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrder = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder must be used within OrderProvider');
  }
  return context;
};
