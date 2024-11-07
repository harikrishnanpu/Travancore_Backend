import express from 'express';
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';
import Log from '../models/Logmodal.js';

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
            billingAmount,
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
            billingAmount
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



billingRouter.post('/edit/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const {
      invoiceNo,
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
      billingAmount,
      customerName,
      customerAddress,
      products,
    } = req.body;

    const existingBilling = await Billing.findById(id);
    if (!existingBilling) {
      return res.status(404).json({ message: 'Billing record not found' });
    }

    const productUpdatePromises = [];

    for (const item of products) {
      const itemId = item.item_id;
      const newQuantity = parseInt(item.quantity);

      const product = await Product.findOne({ item_id: itemId });
      if (!product) {
        return res.status(404).json({ message: `Product with ID ${itemId} not found` });
      }

      const existingProduct = existingBilling.products.find(
        (p) => p.item_id === itemId
      );
      const previousQuantity = existingProduct ? parseInt(existingProduct.quantity) : 0;

      if (newQuantity === 0) {
        // Update stock count by adding back the previous quantity to countInStock
        const newStockCount = product.countInStock + previousQuantity;
        product.countInStock = newStockCount;
      
        // Save the updated product stock
        productUpdatePromises.push(product.save());
      
        // Remove the product from the billing document
        await Billing.updateOne({ _id: id }, { $pull: { products: { item_id: itemId } } });
      } else {
        const quantityDifference = newQuantity - previousQuantity;
        const newStockCount = product.countInStock - quantityDifference;

        if (newStockCount < 0) {
          return res.status(400).json({
            message: `Insufficient stock for product ID ${itemId}. Only ${product.countInStock + previousQuantity} available.`,
          });
        }

        product.countInStock = newStockCount;
        productUpdatePromises.push(product.save());

        if (existingProduct) {
          await Billing.updateOne(
            { _id: id, 'products.item_id': itemId },
            { $set: { 'products.$.quantity': newQuantity } }
          );
        } else {
          // Add new product to the billing record if it doesn't exist
          existingBilling.products.push({
            item_id: itemId,
            name: product.name,
            price: product.price,
            quantity: newQuantity,
            category: product.category,
            brand: product.brand
          });
        }
      }
    }

    await Promise.all(productUpdatePromises);
    await existingBilling.save(); // Save changes to `existingBilling.products`

    await Billing.findByIdAndUpdate(
      id,
      {
        invoiceNo,
        invoiceDate,
        salesmanName,
        expectedDeliveryDate,
        billingAmount,
        customerName,
        customerAddress,
      },
      { new: true, useFindAndModify: false }
    );

    res.status(200).json({ message: 'Billing data updated successfully' });
  } catch (error) {
    console.error('Error updating billing data:', error);
    res.status(500).json({ message: 'Error updating billing data', error: error.message });
  }
});




// Get all billings
  billingRouter.get('/', async (req, res) => {
    try {
      // Fetch and sort billing records by createdAt field in descending order (newest first)
      const billings = await Billing.find().sort({ createdAt: -1 });
  
      if (!billings) {
        return res.status(404).json({ message: 'No billings found' });
      }
  
      res.status(200).json(billings);
    } catch (error) {
      console.error('Error fetching billings:', error);
      res.status(500).json({ message: 'Error fetching billings', error: error.message });
    }
  });
  


billingRouter.get('/driver/', async (req, res) => {
  const page = parseInt(req.query.page) || 1; // Default to page 1
  const limit = parseInt(req.query.limit) || 3; // Default to 10 items per page

  try {
    const totalBillings = await Billing.countDocuments(); // Get total billing count
    const billings = await Billing.find()
      .sort({ invoiceDate: -1 })
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


billingRouter.get('/product/get-sold-out/:id',async (req,res)=>{
  const itemId = req.params.id;
    try {
      const totalQuantity = await Billing.getTotalQuantitySold(itemId);
      res.json(totalQuantity)
    } catch (error) {
      res.status(500).json({message: "ERROR OCCURED"})
    }
})

// Get a billing by ID
billingRouter.get('/:id', async (req, res) => {
  try {
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ message: 'Error fetching billing', error });
  }
});


billingRouter.get('/getinvoice/:id', async (req, res) => {
  try {
    const billing = await Billing.findOne({invoiceNo: req.params.id});
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
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Search both `invoiceNo` and `customerName` fields with case insensitive regex
    const suggestions = await Billing.find({
      $or: [
        { invoiceNo: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } }
      ]
    }).limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    console.error("Error fetching suggestions:", error); // Log the error for debugging
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
});


billingRouter.get('/lastOrder/id', async (req, res) => {
  try {
    const billing = await Billing.findOne().sort({ createdAt: -1 });
    res.json(billing.invoiceNo);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching last order' });
  }
});


billingRouter.post("/billing/:id/addExpenses", async (req, res) => {
  try {
    const { id } = req.params;
    const { fuelCharge = 0, otherExpenses = [] } = req.body;

    // Find the billing document by ID
    const billing = await Billing.findById(id);
    if (!billing) {
      return res.status(404).json({ message: "Billing not found" });
    }

    // Update fuelCharge by adding the new value to the existing one
    billing.fuelCharge = parseFloat(billing.fuelCharge) + parseFloat(fuelCharge || 0);

    // Validate and filter otherExpenses to include only entries with a positive amount
    const validOtherExpenses = Array.isArray(otherExpenses)
      ? otherExpenses.filter(expense => 
          typeof expense === "object" && 
          expense !== null && 
          typeof expense.amount === "number" && 
          expense.amount > 0
        )
      : [];

    // Append valid otherExpenses to the billing document
    if (validOtherExpenses.length > 0) {
      billing.otherExpenses.push(...validOtherExpenses.map(expense => ({
        amount: parseFloat(expense.amount),
        remark: expense.remark || ""
      })));
    }

    // Save the updated document
    await billing.save();

    res.status(200).json({ message: "Expenses added successfully", billing });
  } catch (error) {
    console.error("Error adding expenses:", error);
    res.status(500).json({ message: "Error adding expenses" });
  }
});



export default billingRouter;
