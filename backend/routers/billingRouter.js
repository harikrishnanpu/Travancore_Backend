import express from 'express';
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';

const billingRouter = express.Router();

// Create a new billing entry

// Create a new billing entry
billingRouter.post('/create', async (req, res) => {
    try {
        const {
            invoiceNo,
            invoiceDate,
            salesmanName,
            expectedDeliveryDate,
            deliveryStatus,
            paymentStatus,
            customerName,
            customerAddress,
            products, // This should be an array of objects with item_id and quantity
        } = req.body;

        // Array to hold promises for product updates
        const productUpdatePromises = [];

        // Loop through the products array to get product details
        for (const item of products) {
            const itemId = item.item_id; // Extract item_id from the product
            const quantity = item.quantity; // Assuming quantity is also part of the item object

            // Fetch product using item_id
            const product = await Product.findOne({ item_id: itemId }); // Use findOne instead of find

            if (!product) {
                return res.status(404).json({ message: `Product with ID ${itemId} not found` });
            }

            // Log the fetched product for debugging
            console.log('Fetched product:', product);

            // Check if there is enough stock
            if (product.countInStock < quantity) {
                return res.status(400).json({ message: `Insufficient stock for product ID ${itemId}` });
            }

            // Subtract the countInStock
            product.countInStock -= quantity;

            // Push the product save promise to the array
            productUpdatePromises.push(product.save()); // Save the updated product
        }

        // Save the billing data
        const billingData = new Billing({
            invoiceNo,
            invoiceDate,
            salesmanName,
            expectedDeliveryDate,
            deliveryStatus,
            paymentStatus,
            customerName,
            customerAddress,
            products,
        });

        await billingData.save();

        // Await all product save promises
        await Promise.all(productUpdatePromises);

        res.status(201).json({ message: 'Billing data saved successfully', billingData });
    } catch (error) {
        console.error('Error saving billing data:', error);
        res.status(500).json({ message: 'Error saving billing data', error: error.message });
    }
});


// Get all billings
billingRouter.get('/', async (req, res) => {
  try {
    const billings = await Billing.find().sort({ expectedDeliveryDate: 1 });
    res.json(billings);
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ message: 'Error fetching billings', error });
  }
});

billingRouter.get('/driver/', async (req, res) => {
  const page = parseInt(req.query.page) || 1; // Default to page 1
  const limit = parseInt(req.query.limit) || 3; // Default to 10 items per page

  try {
    const totalBillings = await Billing.countDocuments(); // Get total billing count
    const billings = await Billing.find()
      .sort({ expectedDeliveryDate: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      billings,
      totalPages: Math.ceil(totalBillings / limit),
      currentPage: page,
      totalbilling: totalBillings
    });
  } catch (error) {
    console.error("Error fetching billings:", error);
    res.status(500).json({ message: "Error fetching billings" });
  }
});

// Get a billing by ID
billingRouter.get('/:id', async (req, res) => {
  try {
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      return res.status(404).json({ message: 'Billing not found' });
    }
    res.json(billing);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ message: 'Error fetching billing', error });
  }
});


// Fetch all billing numbers
billingRouter.get('/numbers/getBillings', async (req, res) => {
  try {
    const billings = await Billing.find({}, { invoiceNo: 1 }); // Fetch only billingNo
    res.status(200).json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching billing numbers', error });
  }
});


billingRouter.put("/driver/billings/:id", async (req, res) => {
  const { deliveryStatus, paymentStatus } = req.body;
  try {
    const updatedBilling = await Billing.findByIdAndUpdate(
      req.params.id,
      { deliveryStatus, paymentStatus },
      { new: true }
    );
    res.status(200).json(updatedBilling);
  } catch (error) {
    res.status(500).json({ message: "Error updating billing", error });
  }
});


export default billingRouter;
