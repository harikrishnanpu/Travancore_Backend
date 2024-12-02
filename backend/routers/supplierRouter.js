// routes/supplierRouter.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import SupplierAccount from '../models/supplierAccountModal.js';

const supplierRouter = express.Router();

/**
 * @route   POST /api/suppliers/create
 * @desc    Create a new supplier account
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.post(
  '/create',
  [
    // Validation middleware using express-validator
    body('supplierName').trim().notEmpty().withMessage('Supplier Name is required'),
    body('supplierContactNumber')
      .trim()
      .notEmpty()
      .withMessage('Supplier Contact Number is required')
      .matches(/^\d{10}$/)
      .withMessage('Supplier Contact Number must be a 10-digit number'),
    body('bills').isArray().withMessage('Bills must be an array'),
    body('bills.*.invoiceNo')
      .trim()
      .notEmpty()
      .withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount')
      .isFloat({ min: 0 })
      .withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Invoice Date'),
    body('payments').isArray().withMessage('Payments must be an array'),
    body('payments.*.amount')
      .isFloat({ min: 0 })
      .withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy')
      .trim()
      .notEmpty()
      .withMessage('Submitted By is required for each payment'),
    body('payments.*.date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Payment Date'),
    body('payments.*.remark')
      .optional()
      .trim(),
    // You can add more validations as needed
    body('supplierId')
      .trim()
      .notEmpty()
      .withMessage('Supplier ID is required'),
  ],
  async (req, res) => {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first validation error
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const {
        supplierName,
        bills,
        payments,
        supplierAddress,
        supplierId,
      } = req.body;

      // Check if there are duplicate invoice numbers within the bills
      const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
      const uniqueInvoiceNos = new Set(invoiceNos);
      if (invoiceNos.length !== uniqueInvoiceNos.size) {
        return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed within bills.' });
      }

      // Create a new SupplierAccount instance
      const newSupplierAccount = new SupplierAccount({
        sellerId: supplierId.trim(),
        sellerName: supplierName.trim(),
        sellerAddress: supplierAddress.trim(),
        bills: bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        })),
        payments: payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : undefined,
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
        })),
      });

      // Save the new supplier account to the database
      const savedAccount = await newSupplierAccount.save();

      res.status(201).json(savedAccount);
    } catch (error) {
      console.error('Error creating supplier account:', error);

      // Handle duplicate key errors (e.g., duplicate supplierId or accountId)
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        return res.status(400).json({ message: `${duplicateField} must be unique.` });
      }

      res.status(500).json({ message: 'Server Error' });
    }
  }
);

/**
 * @route   DELETE /api/suppliers/:id/delete
 * @desc    Delete a supplier account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.delete('/:id/delete', async (req, res) => {
  try {
    const account = await SupplierAccount.findByIdAndDelete(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Supplier Account not found' });
    }
    res.json({ message: 'Supplier Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier account:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/suppliers/allaccounts
 * @desc    Get all supplier accounts
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.get('/allaccounts', async (req, res) => {
  try {
    // Optionally, implement pagination, filtering, or sorting based on query parameters
    const accounts = await SupplierAccount.find().sort({ createdAt: -1 });
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching supplier accounts:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/suppliers/get/:id
 * @desc    Get a specific supplier account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.get('/get/:id', async (req, res) => {
  try {
    const account = await SupplierAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Supplier Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error fetching supplier account:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   PUT /api/suppliers/:id/update
 * @desc    Update a supplier account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.put(
  '/:id/update',
  [
    // Similar validation as the create route
    body('supplierName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Supplier Name cannot be empty'),
    body('supplierContactNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Supplier Contact Number cannot be empty')
      .matches(/^\d{10}$/)
      .withMessage('Supplier Contact Number must be a 10-digit number'),
    body('bills').optional().isArray().withMessage('Bills must be an array'),
    body('bills.*.invoiceNo')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Invoice Date'),
    body('payments').optional().isArray().withMessage('Payments must be an array'),
    body('payments.*.amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Submitted By is required for each payment'),
    body('payments.*.date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Payment Date'),
    body('payments.*.remark')
      .optional()
      .trim(),
    body('supplierId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Supplier ID cannot be empty'),
    // You can add more validations as needed
  ],
  async (req, res) => {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first validation error
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const { supplierName, bills, payments, supplierAddress, supplierId } = req.body;

      // Find the supplier account by ID
      const account = await SupplierAccount.findById(req.params.id);
      if (!account) {
        return res.status(404).json({ message: 'Supplier Account not found' });
      }

      // Update fields if they are provided
      if (supplierName !== undefined) {
        account.sellerName = supplierName.trim();
      }

      if (supplierContactNumber !== undefined) {
        account.sellerAddress = supplierAddress.trim();
      }

      if (supplierId !== undefined) {
        account.sellerId = supplierId.trim();
      }

      if (bills !== undefined) {
        // Check for duplicate invoice numbers within the bills
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed within bills.' });
        }

        // Update bills
        account.bills = bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        }));
      }

      if (payments !== undefined) {
        // Update payments
        account.payments = payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : undefined,
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
        }));
      }

      // Save the updated account (balanceAmount, paidAmount, pendingAmount will be auto-calculated)
      const updatedAccount = await account.save();

      res.json(updatedAccount);
    } catch (error) {
      console.error('Error updating supplier account:', error);

      // Handle duplicate key errors (e.g., duplicate supplierId or accountId)
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        return res.status(400).json({ message: `${duplicateField} must be unique.` });
      }

      res.status(500).json({ message: 'Server Error' });
    }
  }
);

export default supplierRouter;
