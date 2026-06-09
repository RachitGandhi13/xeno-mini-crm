import { Router } from 'express';
import { validateBody, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  CreateCustomerSchema,
  BulkCreateCustomersSchema,
  ListCustomersQuerySchema,
} from './customers.schema';
import {
  createOrUpdateCustomer,
  bulkCreateCustomers,
  listCustomers,
  getCustomerById,
} from './customers.service';

const router = Router();

// POST /api/customers — create or upsert a single customer
router.post(
  '/',
  validateBody(CreateCustomerSchema),
  asyncHandler(async (req, res) => {
    const result = await createOrUpdateCustomer(req.body);
    res.status(201).json(result);
  })
);

// POST /api/customers/bulk — ingest up to 1000 customers in one request
router.post(
  '/bulk',
  validateBody(BulkCreateCustomersSchema),
  asyncHandler(async (req, res) => {
    const result = await bulkCreateCustomers(req.body.customers);
    res.status(207).json(result); // 207 Multi-Status: partial failures possible
  })
);

// GET /api/customers — paginated list with optional city/search filters
router.get(
  '/',
  validateQuery(ListCustomersQuerySchema),
  asyncHandler(async (req, res) => {
    const query = (req as typeof req & { validatedQuery: typeof ListCustomersQuerySchema._type }).validatedQuery;
    res.json(await listCustomers(query));
  })
);

// GET /api/customers/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getCustomerById(req.params.id));
  })
);

export default router;
