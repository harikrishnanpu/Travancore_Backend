import express from 'express';
import QRCode from 'qrcode';
import QrCodeDB from '../models/qrcodeVerificstionModal.js';
import { chromium } from 'playwright';
import Return from '../models/returnModal.js';

const printRouter = express.Router();



// Helper function to safely get values or return "N/A" if undefined
const safeGet = (value) => (value ? value : 'N/A');

printRouter.post('/generate-pdf', async (req, res) => {
  const {
    invoiceNo,
    invoiceDate,
    salesmanName,
    expectedDeliveryDate,
    deliveryStatus,
    paymentStatus,
    paymentAmount,
    paymentMethod,
    paymentReceivedDate,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    billingAmount,
    subTotal,
    cgst,
    sgst,
    discount,
    products,
  } = safeGet(req.body);

  // Safely handle products array
  const productList = Array.isArray(products) ? products : [];
  const totalProducts = productList.length;

  const productsPerPage = 10;

  if(!billingAmount){
    res.status(500).json({message: 'error' });
  }

  // Function to generate invoice content
  const generatePageHTML = ( 
    productsChunk,
    pageNumber,
    totalPages,
    showTotals
  ) => `
  <div class="invoice">
        <!-- Header Section -->
        <div class="header">
            <p style="font-weight: 900;">KK TRADING</p>
            <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
            <div>
                <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                <p>Salesman: <strong>${salesmanName}</strong></p>
                <p>Additional Info:</p>
            </div>
            <div>
                <p><strong>From:</strong></p>
                <p style="font-weight: bold;">KK TRADING</p>
                <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                <p style="font-size: 10px;">Alappuzha, 688503</p>
                <p style="font-size: 10px;">Contact: 0477 2080282</p>
                <p style="font-size: 10px;">tradeinkk@gmail.com</p>
            </div>
        </div>
        <div class="invoice-info">

        <div style="font-size: 10px;">
            <p><strong>Estimate To:</strong></p>
            <p style="font-weight: bold;">${customerName}</p>
            <p>${customerAddress}</p>
            <p>State: Kerala</p>
            <p>Contact: ${customerContactNumber}</p>
        </div>

        <div style="font-size: 10px;">
            <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
        </div>

        <div style="font-size: 10px;">
            <p><strong>Payment:</strong></p>
            <p>Amount Paid: ${paymentAmount} </p>
            <p>Payment Method: ${paymentMethod || ''}</p>
            <p>Received Date: ${paymentReceivedDate || ''} </p>
            <p>Remaining Amount: ${(parseFloat(billingAmount) - parseFloat( paymentAmount + discount )).toFixed(2)}  </p>
        </div>

        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>Sl</th>
                    <th>Item Id</th>
                    <th>Item Name</th>
                    <th>QTY</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>QTY(nos)</th>
                    <th>Unit Rate + Tax</th>
                    <th>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                ${
                    productsChunk.length > 0
                      ? productsChunk.map((product,index) => `
                          <tr>
          <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                              <td>${safeGet(product.item_id)}</td>
                              <td>${safeGet(product.name)}</td>
                              <td>${safeGet(product.enteredQty)}</td>
                              <td>${safeGet(product.unit)}</td>
                              <td>${safeGet(product.sellingPrice)}</td>
                              <td>${safeGet(product.quantity)}</td>
                              <td>${safeGet(product.sellingPriceinQty)}</td>
                              <td>${(product.quantity * product.sellingPriceinQty).toFixed(2) || 'N/A'}</td>
                          </tr>`).join('')
                      : '<tr><td colspan="5">No Products Available</td></tr>'
                  }
            </tbody>
        </table>

        <!-- Totals Section -->
        ${showTotals ? `
        <div style="display: flex; justify-content: space-between;" class="totals">
            <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                <p><strong>Authorised Signatory:</strong></p>
                <p style="margin-top: 40px;">Date: ------------------------------</p>
                <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
            </div>
            <div>
                <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                <p>Round Off: <span>0.0</span></p>
                <p style="font-size: 15px;"><strong>Total Amount: <span>${(billingAmount)}</span></strong></p>
            </div>
        </div> ` : `` }

        <!-- Payment Instructions -->

        <!-- Footer Section -->
                <footer>Page ${pageNumber} of ${totalPages}</footer>
        <footer>
            <p>Thank you for your business! 45 ദിവസത്തിന് ശേഷം ഉൽപ്പന്നങ്ങൾ മാറ്റിസ്ഥാപിക്കാനോ തിരികെ നൽകാനോ കഴിയില്ല. 30 ദിവസത്തിനുള്ളിൽ പകരം വയ്ക്കുന്നവർക്ക് മാത്രം ജിഎസ്ടി ഉൾപ്പെടെയുള്ള റീഫണ്ടുകൾ.</p>
        </footer>
    </div>
  `;

  // Generate the full HTML content
  let combinedHTMLContent = '';
  const totalPages = Math.ceil(productList.length / productsPerPage);

  for (let i = 0; i < totalPages; i++) {
    const productsChunk = productList.slice(
      i * productsPerPage,
      (i + 1) * productsPerPage
    );
    const showTotals = i === totalPages - 1;
    combinedHTMLContent += generatePageHTML(
      productsChunk,
      i + 1,
      totalPages,
      showTotals
    );
  }

  const fullHTMLContent = `
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK INVOICE</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }
    </style>
    </head>
    <body>
    ${combinedHTMLContent}
    </body>
    </html>
`;

  // Generate the PDF using Playwright
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(fullHTMLContent, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' },
    });

    await browser.close();

    // Send the PDF as a response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=Invoice_${invoiceNo}.pdf`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// New route to send the HTML content directly

printRouter.post('/generate-invoice-html', async (req, res) => {
  try {
    let {
      invoiceNo,
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
      paymentAmount,
      paymentMethod,
      paymentReceivedDate,
      customerName,
      customerAddress,
      customerContactNumber,
      marketedBy,
      billingAmount,
      subTotal,
      cgst,
      sgst,
      transportation,
      unloading,
      handling,
      discount,
      products,
      perItemDiscount,
      grandTotal
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo) {
      return res.status(400).json({ error: 'invoiceNo is required' });
    }

    // Safely handle products array
    const productList = Array.isArray(products) ? products : [];
    const totalProducts = productList.length;
    billingAmount = parseFloat(billingAmount) || 0;
    paymentAmount = parseFloat(paymentAmount) || 0;

    const productsPerPage = 10;

    const NewQrCodeId = `${invoiceNo}-${Date.now()}`

    if(NewQrCodeId){
        const qrcodeDb = new QrCodeDB({
            qrcodeId: NewQrCodeId,
            billId: invoiceNo,
        })

        await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Function to generate invoice content
    const generatePageHTML = (
      productsChunk,
      pageNumber,
      totalPages,
      showTotals
    ) => `
     <div class="invoice">
          <!-- Header Section -->
          <div class="header">
              <p style="font-weight: 900;">KK TRADING</p>
              <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
          </div>

          <!-- Invoice Information -->
          <div class="invoice-info">
              <div>
                  <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                  <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                  <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                  <p>Salesman: <strong>${salesmanName}</strong></p>
                  <p>Additional Info:</p>
              </div>
                        <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
              <img src="${qrCodeDataURL}" alt="QR Code for Invoice" style="width: 50px; height: 50px;" />
          </div>
              <div>
                  <p><strong>From:</strong></p>
                  <p style="font-weight: bold;">KK TRADING</p>
                  <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                  <p style="font-size: 10px;">Alappuzha, 688503</p>
                  <p style="font-size: 10px;">Contact: 0477 2080282</p>
                  <p style="font-size: 10px;">tradeinkk@gmail.com</p>
              </div>
          </div>
          <div class="invoice-info">

          <div style="font-size: 10px;">
              <p><strong>Estimate To:</strong></p>
              <p style="font-weight: bold;">${customerName}</p>
              <p>${customerAddress}</p>
              <p>State: Kerala</p>
              <p>Contact: ${customerContactNumber}</p>
          </div>

          <div style="font-size: 10px;">
              <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
          </div>

          <div style="font-size: 10px;">
              <p><strong>Payment:</strong></p>
              <p>Amount Paid: ${paymentAmount} </p>
              <p>Payment Method: ${paymentMethod || ''}</p>
              <p>Received Date: ${paymentReceivedDate || ''} </p>
              <p>Remaining Amount: ${(billingAmount - paymentAmount).toFixed(2)}  </p>
          </div>

          </div>

          <!-- Invoice Table -->
          <table class="invoice-table">
              <thead>
                  <tr>
                      <th>Sl</th>
                      <th>Item Id</th>
                      <th>Item Name</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Price</th>
                      <th>Qty(Nos)</th>
                      <th>Unit Rate</th>
                      <th>Discount</th>
                      <th>Total Amount</th>
                  </tr>
              </thead>
              <tbody>
                  ${
                      productsChunk.length > 0
                        ? productsChunk.map((product, index) => `
                            <tr>
                                <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                                <td>${safeGet(product.item_id)}</td>
                                <td>${safeGet(product.name)}</td>
                                <td>${safeGet(product.enteredQty)}</td>
                                <td>${safeGet(product.unit)}</td>
                                <td>${safeGet(product.sellingPrice)}</td>
                                <td>${safeGet(product.quantity)}</td>
                                <td>${safeGet(product.sellingPriceinQty)}</td>
                                <td>${(product.quantity * parseFloat(perItemDiscount)).toFixed(2)}</td>
                                <td>${((product.quantity * parseFloat(product.sellingPriceinQty)) - (product.quantity * parseFloat(perItemDiscount))).toFixed(2) || 'N/A'}</td>
                            </tr>`).join('')
                        : '<tr><td colspan="10">No Products Available</td></tr>'
                  }
              </tbody>
          </table>

          <!-- Totals Section -->
          ${showTotals ? `
          <div style="display: flex; justify-content: space-between;" class="totals">
              <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                  <p><strong>Authorised Signatory:</strong></p>
                  <p style="margin-top: 40px;">Date: ------------------------------</p>
                  <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
              </div>
              <div>
                  <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                  <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                  <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                  <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                  <p>Total Amount: <span>${parseFloat(billingAmount || 0).toFixed(2)}</span></p>
                  <p>Transportation Charges: <span>${parseFloat(transportation || 0).toFixed(2)}</span></p>
                  <p>Unloading Charges: <span>${parseFloat(unloading || 0).toFixed(2)}</span></p>
                  <p>Handling Charge: <span>${parseFloat(handling || 0).toFixed(2)}</span></p>
                  <p>Round Off: <span>0.0</span></p>
                  <p style="font-size: 15px;"><strong>Grand Total: <span>${parseFloat(grandTotal || 0).toFixed(2)}</span></strong></p>
              </div>
          </div> ` : `` }

          <!-- Footer Section -->
                  <footer>Page ${pageNumber} of ${totalPages}</footer>
          <footer>
              <p>Thank you for your business! 45 ദിവസത്തിന് ശേഷം ഉൽപ്പന്നങ്ങൾ മാറ്റിസ്ഥാപിക്കാനോ തിരികെ നൽകാനോ കഴിയില്ല. 30 ദിവസത്തിനുള്ളിൽ പകരം വയ്ക്കുന്നവർക്ക് മാത്രം ജിഎസ്ടി ഉൾപ്പെടെയുള്ള റീഫണ്ടുകൾ.</p>
          </footer>
      </div>
    `;

    // Generate the full HTML content
    let combinedHTMLContent = '';
    const totalPages = Math.ceil(productList.length / productsPerPage);

    for (let i = 0; i < totalPages; i++) {
      const productsChunk = productList.slice(
        i * productsPerPage,
        (i + 1) * productsPerPage
      );
      const showTotals = i === totalPages - 1;
      combinedHTMLContent += generatePageHTML(
        productsChunk,
        i + 1,
        totalPages,
        showTotals
      );
    }

    const fullHTMLContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KK INVOICE</title>
      <style>
                * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
            page-break-after: always;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        .qr-code-section img {
            width: 100px;
            height: 100px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }


      @media print {
        body * {
          visibility: hidden;
        }
        #printable, #printable * {
          visibility: visible;
        }
        #printable {
          position: absolute;
          left: 0;
          top: 0;
        }
      }
    </style>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </head>
  <body>
    <div id="printable">
      ${combinedHTMLContent}
    </div>
  </body>
  </html>`;

    // Store the invoiceNo in the in-memory store
    // invoiceStore.add(invoiceNo);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});









// Route to generate purchase invoice HTML
// Route to generate purchase invoice HTML
printRouter.post('/generate-purchase-invoice-html', async (req, res) => {
  try {
    const {
      sellerId,
      sellerName,
      sellerAddress,
      sellerGst,
      invoiceNo,
      purchaseId,
      billingDate,
      invoiceDate,
      items,
      totals,
      transportationDetails,
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo || !purchaseId) {
      return res.status(400).json({ error: 'invoiceNo and purchaseId are required' });
    }

    // Safely handle items array
    const productList = Array.isArray(items) ? items : [];
    const totalProducts = productList.length;
    const billingAmount = parseFloat(totals.billingAmount) || 0;

    const productsPerPage = 10;
    const totalPages = Math.ceil(productList.length / productsPerPage);

    // Generate a unique QR Code ID
    const NewQrCodeId = `${invoiceNo}-${Date.now()}`;

    // Save QR Code ID to the database
    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: invoiceNo,
      });

      await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Function to generate invoice content per page
    const generatePageHTML = (productsChunk, pageNumber, totalPages, showTotals) => `
      <div class="invoice">
        <!-- Header Section -->
        <div class="header">
          <p style="font-weight: 900; font-size: 24px;">KK TRADING</p>
          <p style="font-size: 14px; margin-top: 5px; font-weight: 600;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
          <div>
            <p style="font-size: 14px; font-weight: bolder;">Purchase No: <strong>${invoiceNo}</strong></p>
            <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
            <p>Billing Date: <strong>${new Date(billingDate).toLocaleDateString()}</strong></p>
            <p>Seller: <strong>${sellerName}</strong></p>
          </div>

          <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
            <img src="${qrCodeDataURL}" alt="QR Code for Invoice" style="width: 80px; height: 80px;" />
          </div>

          <div>
            <p><strong>From:</strong></p>
            <p style="font-weight: bold;">KK TRADING</p>
            <p style="font-size: 12px;">Moncompu, Chambakulam, Road</p>
            <p style="font-size: 12px;">Alappuzha, 688503</p>
            <p style="font-size: 12px;">Contact: 0477 2080282</p>
            <p style="font-size: 12px;">tradeinkk@gmail.com</p>
          </div>
        </div>

        <div class="invoice-info">
          <!-- Seller Details -->
          <div style="font-size: 12px;">
            <p><strong>Seller Details:</strong></p>
            <p style="font-weight: bold;">${sellerName}</p>
            <p>${sellerAddress}</p>
            <p>State: Kerala</p>
            <p>GST: ${sellerGst || 'N/A'}</p>
            <p>Seller ID: ${sellerId}</p>
          </div>

          <!-- Transportation Details -->
          <div style="font-size: 12px;">
            <p><strong>Transportation Details:</strong></p>
            <p><strong>Logistic Transport:</strong></p>
            <p>Company: ${transportationDetails.logistic.transportCompanyName || 'N/A'}</p>
            <p>GST: ${transportationDetails.logistic.companyGst || 'N/A'}</p>
            <p>Transportation Charges: ₹${parseFloat(transportationDetails.logistic.transportationCharges || 0).toFixed(2)}</p>
            <p>Remark: ${transportationDetails.logistic.remark || 'N/A'}</p>
            <br/>
            <p><strong>Local Transport:</strong></p>
            <p>Company: ${transportationDetails.local.transportCompanyName || 'N/A'}</p>
            <p>GST: ${transportationDetails.local.companyGst || 'N/A'}</p>
            <p>Transportation Charges: ₹${parseFloat(transportationDetails.local.transportationCharges || 0).toFixed(2)}</p>
            <p>Remark: ${transportationDetails.local.remark || 'N/A'}</p>
          </div>
        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Sl</th>
              <th>Item ID</th>
              <th>Item Name</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Purchased Qty</th>
              <th>Entered Qty</th>
              <th>Purchased Unit</th>
              <th>P.Unit</th>
              <th>S.Unit</th>
              <th>Total</th>
              <th>Other Expense</th>
              <th>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              productsChunk.length > 0
                ? productsChunk
                    .map(
                      (product, index) => `
                <tr>
                  <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td>
                  <td>${safeGet(product.itemId)}</td>
                  <td>${safeGet(product.name)}</td>
                  <td>${safeGet(product.brand) || 'N/A'}</td>
                  <td>${safeGet(product.category) || 'N/A'}</td>
                  <td>${safeGet(product.quantity)}</td>
                  <td>${safeGet(product.pUnit) || 'N/A'}</td>
                  <td>${safeGet(product.quantityInNumbers)}</td>
                  <td>${safeGet(product.pUnit) || 'N/A'}</td>
                  <td>${safeGet(product.sUnit) || 'N/A'}</td>
                  <td>₹${(parseFloat(product.billPartPrice) + parseFloat(product.cashPartPrice) ).toFixed(2)}</td>
                  <td>₹${parseFloat(product.allocatedOtherExpense).toFixed(2)}</td>
                  <td>₹${
                  
                  ((
                    product.quantity *
                    (parseFloat(product.billPartPrice) + parseFloat(product.cashPartPrice))
                  ) + parseFloat(
                   product.allocatedOtherExpense * product.quantity
                    ) )
                    
                  .toFixed(2)}</td>
                </tr>`
                    )
                    .join('')
                : '<tr><td colspan="14">No Products Available</td></tr>'
            }
          </tbody>
        </table>

        <!-- Totals Section -->
        ${
          showTotals
            ? `
        <div class="totals">
          <div style="font-size: 12px;">
            <p>SubTotal: ₹${parseFloat(totals.amountWithoutGSTItems || 0).toFixed(2)}</p>
            <p>CGST items: ₹${parseFloat(totals.cgstItems || 0).toFixed(2)}</p>
            <p>SGST items: ₹${parseFloat(totals.sgstItems || 0).toFixed(2)}</p>
            <p>Total Purchase Amount: ₹${parseFloat(totals.totalPurchaseAmount || 0).toFixed(2)}</p>
            <p>Transportation Charges: ₹${parseFloat(totals.transportationCharges || 0).toFixed(2)}</p>
            <p>Unloading Charges: ₹${parseFloat(totals.unloadingCharge || 0).toFixed(2)}</p>
            <p>Insurance: ₹${parseFloat(totals.insurance || 0).toFixed(2)}</p>
            <p>Damage Price: ₹${parseFloat(totals.damagePrice || 0).toFixed(2)}</p>
            <p>Total Other Expenses: ₹${parseFloat(totals.totalOtherExpenses || 0).toFixed(2)}</p>
            <p>Grand Total Purchase Amount: ₹${parseFloat(totals.grandTotalPurchaseAmount || 0).toFixed(2)}</p>
          </div>
        </div>
        `
            : ``
        }

        <!-- Authorised Signatory Section -->
        ${
          showTotals
            ? `
        <div class="payment-instructions">
          <p><strong>Authorised Signatory:</strong></p>
          <p style="margin-top: 40px;">Date: ____________________________</p>
          <p style="font-weight: bold; text-align: center; margin-top: 20px;">KK TRADING</p>
        </div>
        `
            : ``
        }
      </div>
    `;

    // Generate the full HTML content
    let combinedHTMLContent = '';
    for (let i = 0; i < totalPages; i++) {
      const productsChunk = productList.slice(i * productsPerPage, (i + 1) * productsPerPage);
      const showTotals = i === totalPages - 1;
      combinedHTMLContent += generatePageHTML(productsChunk, i + 1, totalPages, showTotals);
    }

    const fullHTMLContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KK PURCHASE INVOICE - ${invoiceNo}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
          }
          body {
            background-color: #f9f9f9;
          }
          .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: 20px auto;
            page-break-after: always;
          }
          .header {
            background-color: #960101; /* Dark Red */
            padding: 10px 20px;
            color: #fff;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
          }
          .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
          }
          .invoice-info div {
            font-size: 14px;
            color: #333;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 14px;
          }
          .invoice-table td {
            padding: 10px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 12px;
          }
          .totals {
            margin-top: 20px;
            text-align: right;
          }
          .totals p {
            margin: 5px 0;
            font-size: 14px;
          }
          .totals span {
            font-weight: bold;
            color: #960101;
          }
          .payment-instructions {
            margin-top: 30px;
          }
          .qr-code-section img {
            width: 80px;
            height: 80px;
          }
          footer {
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
          }

          @media print {
            body * {
              visibility: hidden;
            }
            #printable, #printable * {
              visibility: visible;
            }
            #printable {
              position: absolute;
              left: 0;
              top: 0;
            }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body>
        <div id="printable">
          ${combinedHTMLContent}
        </div>
      </body>
      </html>
    `;

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating purchase invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



printRouter.post('/verify-qr-code', async (req, res) => {
  try {
    const { qrcodeId } = req.body;

    if (!qrcodeId) {
      return res.status(400).json({ verified: false, message: 'qrcodeId is required' });
    }

    // Find the QR code in the database
    const qrCodeEntry = await QrCodeDB.findOne({ qrcodeId: qrcodeId });

    if (qrCodeEntry) {
      // QR code is found; it's our company's bill
      return res.status(200).json({
        verified: true,
        message: 'This is our company\'s bill.',
        billId: qrCodeEntry.billId,
      });
    } else {
      // QR code not found; it's not our company's bill
      return res.status(404).json({
        verified: false,
        message: 'This is not our company\'s bill.',
      });
    }
  } catch (error) {
    console.error('Error verifying QR Code:', error);
    res.status(500).json({ verified: false, message: 'Internal Server Error' });
  }
});





printRouter.post('/generate-return-invoice-html', async (req, res) => {
  try {
    const { returnNo } = req.body;

    // Validate required field
    if (!returnNo) {
      return res.status(400).json({ error: 'returnNo is required' });
    }

    // Fetch the return data from the database
    const returnData = await Return.findOne({ returnNo });

    if (!returnData) {
      return res.status(404).json({ error: 'Return data not found' });
    }

    // Generate QR Code as Data URL
    const NewQrCodeId = `${returnNo}-${Date.now()}`;

    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: returnNo,
      });

      await qrcodeDb.save();
    }

    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Generate the HTML content
    const htmlContent = generateReturnInvoiceHTML(returnData, qrCodeDataURL);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error generating return invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to generate the return invoice HTML
function generateReturnInvoiceHTML(returnData, qrCodeDataURL) {
  const returnNo = safeGet(returnData.returnNo);
  const billingNo = safeGet(returnData.billingNo);
  const returnDate = safeGet(returnData.returnDate);
  const customerName = safeGet(returnData.customerName);
  const customerAddress = safeGet(returnData.customerAddress);
  const products = Array.isArray(returnData.products) ? returnData.products : [];
  const returnAmount = parseFloat(safeGet(returnData.returnAmount, 0));
  const totalTax = parseFloat(safeGet(returnData.totalTax, 0));
  const netReturnAmount = parseFloat(safeGet(returnData.netReturnAmount, 0));

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK Trading - Return Invoice</title>
    <style>
      /* CSS styles */
      body {
        font-family: Arial, sans-serif;
      }
      .invoice {
        max-width: 800px;
        margin: auto;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 10px;
      }
      .header {
        text-align: center;
        background-color: #960101; /* Dark Red */
        color: #fff;
        padding: 20px;
        border-top-left-radius: 10px;
        border-top-right-radius: 10px;
      }
      .header h1 {
        margin-bottom: 5px;
      }
      .invoice-info, .customer-info {
        margin-top: 20px;
      }
      .invoice-info div, .customer-info div {
        margin-bottom: 5px;
      }
      .qr-code {
        text-align: right;
        margin-top: -100px;
      }
      .products-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      .products-table th, .products-table td {
        border: 1px solid #ddd;
        padding: 8px;
      }
      .products-table th {
        background-color: #f4cccc; /* Light Red */
        color: #960101; /* Dark Red */
      }
      .totals {
        margin-top: 20px;
        text-align: right;
        font-size: 16px;
      }
      .totals p {
        margin: 5px 0;
      }
      footer {
        text-align: center;
        margin-top: 20px;
        font-size: 12px;
        color: #777;
      }
@media print {
    body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        text-align: center; /* Ensure all text is centered */
    }

    .invoice {
        margin: 0 auto; /* Center the invoice horizontally */
        width: 100%; /* Adjust width as needed */
        max-width: 800px; /* Set a maximum width for the printed content */
        padding: 20px;
        border: none; /* Remove any borders to look clean */
        box-shadow: none; /* Remove shadows */
        page-break-inside: avoid; /* Avoid page breaks inside the invoice */
    }

    .header, .footer {
        text-align: center;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: auto; /* Center the table */
    }

    th, td {
        padding: 8px;
        border: 1px solid #ddd;
    }
}

    </style>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </head>
  <body>
    <div class="invoice">
      <div class="header">
        <h1>KK TRADING</h1>
        <p>Tiles, Granites, Sanitary Wares, UV Sheets</p>
      </div>
      <div class="qr-code">
        <img src="${qrCodeDataURL}" alt="QR Code" width="100" height="100" />
      </div>
      <div class="invoice-info">
        <div><strong>Return Invoice No:</strong> ${returnNo}</div>
        <div><strong>Billing No:</strong> ${billingNo}</div>
        <div><strong>Return Date:</strong> ${new Date(returnDate).toLocaleDateString()}</div>
      </div>
      <div class="customer-info">
        <div><strong>Customer Name:</strong> ${customerName}</div>
        <div><strong>Customer Address:</strong> ${customerAddress}</div>
      </div>
      <table class="products-table">
        <thead>
          <tr>
            <th>Sl</th>
            <th>Item ID</th>
            <th>Name</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${
            products.length > 0
              ? products
                  .map(
                    (product, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${safeGet(product.item_id)}</td>
                <td>${safeGet(product.name)}</td>
                <td>${safeGet(product.quantity)}</td>
              </tr>
            `
                  )
                  .join('')
              : '<tr><td colspan="4">No products returned.</td></tr>'
          }
        </tbody>
      </table>
      <div class="totals">
        <p><strong>Return Amount:</strong> ₹${returnAmount.toFixed(2)}</p>
        <p><strong>Total Tax:</strong> ₹${totalTax.toFixed(2)}</p>
        <p><strong>Net Return Amount:</strong> ₹${netReturnAmount.toFixed(2)}</p>
      </div>
      <footer>
        <p>Thank you for your business!</p>
      </footer>
    </div>
  </body>
  </html>
  `;
}


printRouter.post('/generate-loading-slip-pdf', async (req, res) => {
  const {
    invoiceNo,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    salesmanName,
    invoiceDate,
    expectedDeliveryDate,
    deliveryStatus,
    billingAmountReceived,
    payments = [],
    deliveries = [],
    products = [],
  } = req.body || {};

  if (!invoiceNo || !Array.isArray(products)) {
    return res.status(400).json({ error: 'invoiceNo and products are required' });
  }

  // Extract delivery dates
  const deliveryDates = deliveries
    .filter(d => d && d.startLocations && d.startLocations.length > 0)
    .map(d => d.startLocations[0].timestamp)
    .filter(date => date)
    .sort((a, b) => new Date(a) - new Date(b))
    .map(date => new Date(date).toLocaleDateString());

  // Format payment details
  const totalAmountPaid = billingAmountReceived || 0;
  const paymentDetails = payments.map((p) => {
    return `Paid: Rs. ${parseFloat(p.amount).toFixed(2)}, Method: ${p.method}, Ref: ${p.referenceId}, Date: ${p.date ? new Date(p.date).toLocaleDateString() : 'N/A'}`;
  });

  const productsPerPage = 15; // fewer items per page for readability
  const totalPages = Math.ceil(products.length / productsPerPage);

  const safeGet = (value) => (value ? value : 'N/A');

  const generatePageHTML = (productsChunk, pageNumber, totalPages) => {
    let rowsHTML = productsChunk.map((product, index) => {
      const slNo = index + 1 + (pageNumber - 1) * productsPerPage;

      const quantity = parseInt(product.quantity, 10) || 0;
      const deliveredQuantity = parseInt(product.deliveredQuantity, 10) || 0;
      const psRatio = parseInt(product.psRatio, 10) || 1;
      const remainingQuantity = quantity - deliveredQuantity;

      if (psRatio > 1) {
        // Calculate boxes and pieces for ordered
        const oBoxes = Math.floor(quantity / psRatio);
        const oPieces = quantity % psRatio;

        // Calculate boxes and pieces for delivered
        const dBoxes = Math.floor(deliveredQuantity / psRatio);
        const dPieces = deliveredQuantity % psRatio;

        // Calculate boxes and pieces for remaining
        const rBoxes = Math.floor(remainingQuantity / psRatio);
        const rPieces = remainingQuantity % psRatio;

        return `
          <tr>
            <td>${slNo}</td>
            <td>${safeGet(product.item_id)}</td>
            <td>${safeGet(product.name)}</td>
            <!-- Ordered -->
            <td>${oBoxes}</td>
            <td>${oPieces}</td>
            <td>${(oBoxes * psRatio) + oPieces}</td>
            <!-- Delivered -->
            <td>${dBoxes}</td>
            <td>${dPieces}</td>
            <td>${(dBoxes * psRatio) + dPieces}</td>
            <!-- Remaining -->
            <td>${rBoxes}</td>
            <td>${rPieces}</td>
            <td>${(rBoxes * psRatio) + rPieces}</td>
          </tr>
        `;
      } else {
        // psRatio = 1, show as single numbers
        return `
          <tr>
            <td>${slNo}</td>
            <td>${safeGet(product.item_id)}</td>
            <td>${safeGet(product.name)}</td>
            <td>${quantity}</td>
            <td>${deliveredQuantity}</td>
            <td>${remainingQuantity}</td>
          </tr>
        `;
      }
    }).join('');

    // If no products
    if (productsChunk.length === 0) {
      rowsHTML = '<tr><td colspan="12">No Products</td></tr>';
    }

    // Determine table header based on psRatio of the first product in the chunk (assuming consistent psRatio usage)
    let tableHeaders = '';
    const firstProduct = productsChunk[0];
    const firstPsRatio = firstProduct ? parseInt(firstProduct.psRatio, 10) || 1 : 1;

    if (firstPsRatio > 1) {
      tableHeaders = `
        <tr>
          <th rowspan="2">Sl</th>
          <th rowspan="2">Item ID</th>
          <th rowspan="2">Product Name</th>
          <th colspan="3">Ordered</th>
          <th colspan="3">Delivered</th>
          <th colspan="3">Remaining</th>
        </tr>
        <tr>
          <th>Boxes</th>
          <th>Pcs</th>
          <th>Total Pcs</th>
          <th>Boxes</th>
          <th>Pcs</th>
          <th>Total Pcs</th>
          <th>Boxes</th>
          <th>Pcs</th>
          <th>Total Pcs</th>
        </tr>
      `;
    } else {
      tableHeaders = `
        <tr>
          <th>Sl</th>
          <th>Item ID</th>
          <th>Product Name</th>
          <th>Ordered</th>
          <th>Delivered</th>
          <th>Remaining</th>
        </tr>
      `;
    }

    return `
    <div class="loading-slip">
      <!-- Header Section -->
      <div class="header">
        <h1>KK TRADING</h1>
        <p class="sub-header">Tiles, Granites, Sanitary Wares, UV Sheets</p>
      </div>

      <!-- Delivery & Payment Info -->
      <div class="info-section">
        <div class="left-info">
          <p><strong>Loading Slip For Invoice:</strong> ${safeGet(invoiceNo)}</p>
          <p><strong>Invoice Date:</strong> ${new Date(invoiceDate).toLocaleDateString()}</p>
          <p><strong>Expected Delivery:</strong> ${new Date(expectedDeliveryDate).toLocaleDateString()}</p>
          <p><strong>Salesman:</strong> ${safeGet(salesmanName)}</p>
          <p><strong>Marketed By:</strong> ${safeGet(marketedBy)}</p>
          <p><strong>Delivery Status:</strong> ${safeGet(deliveryStatus)}</p>
        </div>
        <div class="right-info">
          <p><strong>Customer:</strong> ${safeGet(customerName)}</p>
          <p>${safeGet(customerAddress)}</p>
          <p>Contact: ${safeGet(customerContactNumber)}</p>
          <p><strong>Delivery Dates:</strong> ${deliveryDates.length > 0 ? deliveryDates.join(', ') : 'N/A'}</p>
          <p><strong>Total Paid:</strong> Rs. ${parseFloat(totalAmountPaid).toFixed(2)}</p>
        </div>
      </div>

      <div class="loading-slip-title">
        <h2>LOADING SLIP</h2>
      </div>

      <!-- Payment Details Section -->
      <div class="payment-details">
        <p><strong>Payment Details:</strong></p>
        ${
          paymentDetails.length > 0
          ? paymentDetails.map(pd => `<p>${pd}</p>`).join('')
          : '<p>No payment details available.</p>'
        }
      </div>

      <!-- Products Table -->
      <table class="products-table">
        <thead>
          ${tableHeaders}
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <div class="footer-section">
        <p>Page ${pageNumber} of ${totalPages}</p>
        <p class="disclaimer">
          This document is a Loading Slip only. Please verify quantities before dispatch.
          Returns or exchanges are subject to the company's terms and conditions.
        </p>
      </div>
    </div>
    `;
  };

  const fullHTMLContentPages = [];
  for (let i = 0; i < totalPages; i++) {
    const productsChunk = products.slice(i * productsPerPage, (i + 1) * productsPerPage);
    fullHTMLContentPages.push(generatePageHTML(productsChunk, i + 1, totalPages));
  }

  const fullHTMLContent = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Loading Slip - ${invoiceNo}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f9f9f9;
          margin: 0;
          padding: 0;
          font-size: 10px;
        }
        .loading-slip {
          background-color: #fff;
          width: 95%;
          max-width: 1000px;
          margin: 20px auto;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
          page-break-after: always;
        }
        .header {
          background-color: #960101; /* Dark Red */
          padding: 10px;
          color: #fff;
          text-align: center;
          border-top-left-radius: 10px;
          border-top-right-radius: 10px;
        }
        .header h1 {
          margin-bottom: 5px;
          font-size: 16px;
          font-weight: bold;
        }
        .sub-header {
          font-size: 10px;
          font-weight: 700;
        }
        .info-section {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e0e0e0;
        }
        .info-section .left-info, .info-section .right-info {
          width: 48%;
        }
        .info-section p {
          margin: 2px 0;
        }
        .loading-slip-title {
          text-align: center;
          margin-top: 10px;
        }
        .loading-slip-title h2 {
          font-size: 12px;
          color: #960101;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .payment-details {
          margin-top: 10px;
          font-size: 9px;
          line-height: 1.2em;
        }
        .payment-details p {
          margin: 2px 0;
        }
        .products-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          font-size: 9px;
        }
        .products-table th {
          background-color: #f4cccc;
          color: #960101;
          padding: 4px;
          border: 1px solid #ddd;
          text-align: center;
        }
        .products-table td {
          padding: 4px;
          text-align: center;
          border: 1px solid #ddd;
          color: #333;
          font-size: 9px;
        }
        .footer-section {
          text-align: center;
          margin-top: 10px;
          font-size: 8px;
          color: #777;
        }
        .footer-section .disclaimer {
          font-style: italic;
          margin-top: 5px;
        }

        @media print {
          body {
            margin:0;
            padding:0;
          }
          .loading-slip {
            page-break-after: always;
          }
          .footer-section {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      ${fullHTMLContentPages.join('')}
    </body>
  </html>
  `;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(fullHTMLContent, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '10px', right: '10px' },
    });

    await browser.close();

    // Send the PDF as a response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=LoadingSlip_${invoiceNo}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating Loading Slip PDF:', error);
    res.status(500).json({ error: 'Failed to generate Loading Slip PDF' });
  }
});


printRouter.post('/generate-leave-application-pdf', async (req, res) => {
  const { 
    userName,
    userId,
    reason,
    startDate,
    endDate,
    status,
    _id 
  } = req.body;

  const today = new Date().toLocaleDateString();
  const formattedStartDate = new Date(startDate).toLocaleDateString();
  const formattedEndDate = new Date(endDate).toLocaleDateString();

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Leave Application</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        font-size: 12px;
        margin: 30px;
        color: #333;
      }

      .header {
        text-align: center;
        margin-bottom: 20px;
      }

      .header h1 {
        margin-bottom: 5px;
        font-size: 16px;
        font-weight: bold;
        color: #960101;
      }

      .header p {
        margin: 2px 0;
        font-size: 10px;
        color: #555;
      }

      hr {
        margin: 10px 0;
        border: none;
        border-top: 1px solid #ccc;
      }

      .date {
        text-align: right;
        margin-bottom: 20px;
        font-size: 10px;
      }

      .content {
        line-height: 1.5;
      }

      .content p {
        margin-bottom: 10px;
      }

      .signature {
        margin-top: 50px;
      }

      .signature-line {
        margin-bottom: 5px;
        width: 200px;
        border-bottom: 1px solid #333;
      }

      footer {
        text-align: center;
        font-size: 8px;
        color: #999;
        margin-top: 50px;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>KK TRADING</h1>
      <p>Chambakulam, Moncompu</p>
      <p>Contact: 8606565282 | tradeinkk@gmail.com</p>
      <hr>
    </div>

    <div class="date">
      <p>Date: ${today}</p>
    </div>

    <div class="content">
      <p><strong>Subject:</strong> Leave Application</p>
      <p><strong>Name:</strong> ${userName}</p>
      <p><strong>User ID:</strong> ${userId}</p>
      <p><strong>Reason for Leave:</strong> ${reason}</p>
      <p><strong>Start Date:</strong> ${formattedStartDate}</p>
      <p><strong>End Date:</strong> ${formattedEndDate}</p>
      <p><strong>Status:</strong> ${status}</p>

      <p>I kindly request your approval for the leave period stated above. I assure that any pending responsibilities will be managed or delegated appropriately during my absence. I will resume my duties promptly upon my return.</p>
    </div>

    <div class="signature">
      <div class="signature-line"></div>
      <p>Signature of Applicant</p>
    </div>

    <footer>
      <p>KK Trading - Leave Letter</p>
    </footer>
  </body>
  </html>
  `;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Leave_${_id}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating leave application PDF:', error);
    res.status(500).json({ error: 'Failed to generate leave application PDF' });
  }
});













export default printRouter;