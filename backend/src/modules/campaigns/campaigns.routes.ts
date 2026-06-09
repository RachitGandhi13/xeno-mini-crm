import { Router } from 'express';
import { validateBody, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  CreateCampaignSchema,
  ListCampaignsQuerySchema,
} from './campaigns.schema';
import {
  createCampaign,
  launchCampaign,
  getCampaignAnalytics,
  listCampaigns,
  getCampaignById,
} from './campaigns.service';

const router = Router();

// POST /api/campaigns — create a campaign in draft state
router.post(
  '/',
  validateBody(CreateCampaignSchema),
  asyncHandler(async (req, res) => {
    const campaign = await createCampaign(req.body);
    res.status(201).json(campaign);
  })
);

// GET /api/campaigns — list all campaigns with optional status filter
router.get(
  '/',
  validateQuery(ListCampaignsQuerySchema),
  asyncHandler(async (req, res) => {
    const query = (req as typeof req & { validatedQuery: typeof ListCampaignsQuerySchema._type }).validatedQuery;
    res.json(await listCampaigns(query));
  })
);

// GET /api/campaigns/:id — campaign detail
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getCampaignById(req.params.id));
  })
);

// POST /api/campaigns/:id/launch — transition draft → running and kick off dispatch
// Returns 200 with the campaign in 'running' state immediately. The actual
// dispatch to the channel service happens asynchronously in the background.
router.post(
  '/:id/launch',
  asyncHandler(async (req, res) => {
    const result = await launchCampaign(req.params.id);
    res.json(result);
  })
);

// GET /api/campaigns/:id/analytics — delivery funnel + conversion stats
router.get(
  '/:id/analytics',
  asyncHandler(async (req, res) => {
    res.json(await getCampaignAnalytics(req.params.id));
  })
);

export default router;
