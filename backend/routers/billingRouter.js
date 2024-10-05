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
            // console.log('Fetched product:', product);

            // Check if there is enough stock
            if (product.countInStock < parseInt(quantity)) {
                return res.status(400).json({ message: `Insufficient stock for product ID ${itemId}` });
            }

            // Subtract the countInStock
            product.countInStock -= parseInt(quantity);

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
      console.log("not found")
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(billing);
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

// Route to fetch a limited number of low-stock products (e.g., for homepage)
billingRouter.get('/deliveries/expected-delivery', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of today (00:00:00)

    const billings = await Billing.find({expectedDeliveryDate: { $gte: today },deliveryStatus: { $ne: 'Delivered' }}).sort({ expectedDeliveryDate: 1 }).limit(1); // Limit to 3 products
    // console.log(billings)
    res.json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});

billingRouter.get('/alldelivery/all', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of today (00:00:00)
    const billings = await Billing.find({expectedDeliveryDate: {$gte: today}, deliveryStatus: { $ne: 'Delivered' }}).sort({ expectedDeliveryDate: 1 }) // Limit to 3 products
    // console.log(billings)
    res.json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


billingRouter.get("/billing/suggestions", async (req, res) => {
  try {
    const { search = "" } = req.query;
    const suggestions = await Billing.find({
      invoiceNo: { $regex: search, $options: "i" }, // case-insensitive search for suggestions
    }).limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});


billingRouter.delete('/billings/delete/:id',async(req,res)=>{
  try{
    const billing = await Billing.findById(req.params.id)

    if (!billing) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    // Loop through each item in the purchase and update product stock
    for (let item of billing.products) {
      const product = await Product.findOne({item_id: item.item_id});

      if (product) {
        // Reduce the countInStock by the quantity in the purchase
        product.countInStock += parseInt(item.quantity)

        if (product.countInStock < 0) {
          product.countInStock = 0; // Ensure stock doesn't go below zero
        }

        await product.save();  // Save the updated product
      }
    }

    const deleteProduct = await billing.remove();
    res.send({ message: 'Product Deleted', bill: deleteProduct });
  }catch(error){
    res.status(500).send({ message: 'Error Occured' });
  }
})

export default billingRouter;
