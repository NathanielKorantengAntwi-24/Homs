import { db } from '../config/firebase';
import { collection, query, where, getAggregateFromServer, sum, count } from 'firebase/firestore';

export const getMonthlyFinancials = async (year, month) => {
  const ordersRef = collection(db, "orders");
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);

  const q = query(
    ordersRef,
    where("currentStatus", "in", [7, 8]), 
    where("orderTime", ">=", startDate),
    where("orderTime", "<=", endDate)
  );

  // Must use getAggregateFromServer for Vite/React environment
  const snapshot = await getAggregateFromServer(q, {
    totalRevenue: sum('financials.grandTotal'),
    netSales: sum('financials.subtotal'),
    totalServiceCharge: sum('financials.serviceCharge'),
    orderCount: count()
  });

  return snapshot.data();
};