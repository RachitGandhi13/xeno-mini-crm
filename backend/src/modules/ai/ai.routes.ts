import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { AISegmentRequestSchema, AIMessageRequestSchema } from './ai.schema';
import { generateSegmentFromPrompt, generateMessageTemplate } from './ai.service';

const router = Router();

// POST /api/ai/segment
// Converts a natural language prompt into SegmentRule[] + runs a live audience
// count query so the frontend can show the count immediately.
//
// This endpoint is the core AI feature: NL → Rules → SQL → live count.
// The compiledSql field in the response makes the full chain visible to the user.
router.post(
  '/segment',
  validateBody(AISegmentRequestSchema),
  asyncHandler(async (req, res) => {
    const result = await generateSegmentFromPrompt(req.body.prompt);
    res.json(result);
  })
);

// POST /api/ai/message
// Generates a personalised message template for a given audience and channel.
router.post(
  '/message',
  validateBody(AIMessageRequestSchema),
  asyncHandler(async (req, res) => {
    const result = await generateMessageTemplate(req.body);
    res.json(result);
  })
);

export default router;
