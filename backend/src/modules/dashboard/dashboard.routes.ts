import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { pool } from '../../db';

const router = Router();

// GET /api/dashboard/stats — aggregated KPIs for the main dashboard.
// Single query with five scalar subqueries is more efficient than five
// separate round-trips from the frontend.
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<{
      total_customers: string;
      total_campaigns: string;
      active_campaigns: string;
      attributed_revenue: string;
      monthly_conversions: string;
    }>(`
      SELECT
        (SELECT COUNT(*)         FROM customers)                                                AS total_customers,
        (SELECT COUNT(*)         FROM campaigns)                                                AS total_campaigns,
        (SELECT COUNT(*)         FROM campaigns  WHERE status = 'running')                     AS active_campaigns,
        (SELECT COALESCE(SUM(total_amount::numeric), 0)
                                 FROM orders     WHERE attributed_campaign_id IS NOT NULL)      AS attributed_revenue,
        (SELECT COUNT(*)         FROM orders
                                 WHERE attributed_campaign_id IS NOT NULL
                                   AND created_at >= NOW() - INTERVAL '30 days')               AS monthly_conversions
    `);

    const r = rows[0];
    res.json({
      totalCustomers: parseInt(r.total_customers, 10),
      totalCampaigns: parseInt(r.total_campaigns, 10),
      activeCampaigns: parseInt(r.active_campaigns, 10),
      attributedRevenue: parseFloat(r.attributed_revenue),
      monthlyConversions: parseInt(r.monthly_conversions, 10),
    });
  })
);

export default router;
