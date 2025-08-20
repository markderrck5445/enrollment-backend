const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Form submission rate limiting (more strict)
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 form submissions per 15 minutes
  message: {
    success: false,
    message: 'Too many enrollment attempts. Please try again in 15 minutes.'
  }
});

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://your-frontend-domain.com',
    'https://your-app.netlify.app',
    'https://your-app.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/enrollment', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

connectDB();

// Enhanced Student Schema
const studentSchema = new mongoose.Schema({
  firstName: { 
    type: String, 
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters'],
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: { 
    type: String, 
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters'],
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[\d\s\-\+\(\)]{10,}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Please provide a valid phone number'
    }
  },
  idnumber: { 
    type: String, 
    required: [true, 'ID number is required'], 
    unique: true,
    trim: true,
    minlength: [6, 'ID number must be at least 6 characters']
  },
  dateOfBirth: { 
    type: Date, 
    required: [true, 'Date of birth is required'],
    validate: {
      validator: function(v) {
        const age = Math.floor((new Date() - v) / (365.25 * 24 * 60 * 60 * 1000));
        return age >= 16 && age <= 100;
      },
      message: 'Age must be between 16 and 100 years'
    }
  },
  course: { 
    type: String, 
    required: [true, 'Course selection is required'],
    trim: true,
    enum: {
      values: [
        'Computer Science',
        'Business Administration', 
        'Engineering',
        'Medicine',
        'Arts & Design',
        'Psychology',
        'Mathematics',
        'Literature',
        'Information Technology',
        'Project Management'
      ],
      message: 'Please select a valid course'
    }
  },
  address: { 
    type: String, 
    required: [true, 'Address is required'],
    trim: true,
    minlength: [10, 'Please provide a complete address']
  },
  city: { 
    type: String, 
    required: [true, 'City is required'],
    trim: true
  },
  zipCode: { 
    type: String, 
    required: [true, 'ZIP code is required'],
    trim: true
  },
  emergencyContact: { 
    type: String, 
    required: [true, 'Emergency contact is required'],
    trim: true
  },
  emergencyPhone: { 
    type: String, 
    required: [true, 'Emergency phone is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[\d\s\-\+\(\)]{10,}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Please provide a valid emergency phone number'
    }
  },
  enrollmentDate: { 
    type: Date, 
    default: Date.now 
  },
  status: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'approved', 'rejected'] 
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Add indexes for better performance
studentSchema.index({ email: 1 });
studentSchema.index({ idnumber: 1 });
studentSchema.index({ enrollmentDate: -1 });

const Student = mongoose.model('Student', studentSchema);

// Enhanced Email Configuration
const createTransporter = () => {
  // Support multiple email services
  const emailService = process.env.EMAIL_SERVICE || 'gmail';
  
  const transporterConfigs = {
    gmail: {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // Use App Password for Gmail
      }
    },
    sendgrid: {
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    },
    mailgun: {
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAILGUN_SMTP_LOGIN,
        pass: process.env.MAILGUN_SMTP_PASSWORD
      }
    },
    outlook: {
      service: 'hotmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    }
  };

  const config = transporterConfigs[emailService];
  if (!config) {
    throw new Error(`Unsupported email service: ${emailService}`);
  }

  return nodemailer.createTransporter(config);
};

// Enhanced Email Templates
const createStudentConfirmationEmail = (student) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Enrollment Confirmation</title>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0; 
                padding: 0; 
                background-color: #f4f4f4; 
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white; 
                box-shadow: 0 0 20px rgba(0,0,0,0.1); 
            }
            .header { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                padding: 30px 20px; 
                text-align: center; 
            }
            .header h1 { 
                margin: 0; 
                font-size: 28px; 
                font-weight: 600; 
            }
            .content { 
                padding: 30px 20px; 
            }
            .welcome-message { 
                font-size: 18px; 
                margin-bottom: 20px; 
                color: #2c3e50; 
            }
            .details-card { 
                background: #f8f9fa; 
                border-left: 4px solid #667eea; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 0 8px 8px 0; 
            }
            .details-card h3 { 
                margin-top: 0; 
                color: #667eea; 
                font-size: 18px; 
            }
            .detail-row { 
                display: flex; 
                justify-content: space-between; 
                margin: 10px 0; 
                padding: 8px 0; 
                border-bottom: 1px solid #dee2e6; 
            }
            .detail-row:last-child { 
                border-bottom: none; 
            }
            .detail-label { 
                font-weight: 600; 
                color: #495057; 
            }
            .detail-value { 
                color: #6c757d; 
            }
            .next-steps { 
                background: #e7f3ff; 
                border: 1px solid #b3d7ff; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 25px 0; 
            }
            .next-steps h3 { 
                color: #0066cc; 
                margin-top: 0; 
            }
            .next-steps ul { 
                margin: 10px 0; 
                padding-left: 20px; 
            }
            .next-steps li { 
                margin: 8px 0; 
                color: #0066cc; 
            }
            .footer { 
                background: #2c3e50; 
                color: #ecf0f1; 
                padding: 25px 20px; 
                text-align: center; 
                font-size: 14px; 
            }
            .footer a { 
                color: #3498db; 
                text-decoration: none; 
            }
            .logo { 
                font-size: 24px; 
                font-weight: bold; 
                margin-bottom: 10px; 
            }
            .highlight { 
                color: #667eea; 
                font-weight: 600; 
            }
            @media only screen and (max-width: 600px) {
                .detail-row { 
                    flex-direction: column; 
                }
                .detail-label { 
                    margin-bottom: 5px; 
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🎓 EduPlatform</div>
                <h1>Enrollment Confirmation</h1>
            </div>
            
            <div class="content">
                <div class="welcome-message">
                    <strong>Dear ${student.firstName} ${student.lastName},</strong>
                </div>
                
                <p>Congratulations! We have successfully received your enrollment application. Thank you for choosing EduPlatform to advance your educational journey.</p>
                
                <div class="details-card">
                    <h3>📋 Your Application Details</h3>
                    <div class="detail-row">
                        <span class="detail-label">Full Name:</span>
                        <span class="detail-value">${student.firstName} ${student.lastName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Course:</span>
                        <span class="detail-value">${student.course}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email:</span>
                        <span class="detail-value">${student.email}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Phone:</span>
                        <span class="detail-value">${student.phone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Application Date:</span>
                        <span class="detail-value">${new Date().toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Application ID:</span>
                        <span class="detail-value">#${student._id.toString().slice(-8).toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="next-steps">
                    <h3>🚀 What Happens Next?</h3>
                    <ul>
                        <li>Your application is currently under review by our admissions team</li>
                        <li>You'll receive an update within <span class="highlight">3-5 business days</span></li>
                        <li>If approved, you'll receive course access credentials and enrollment instructions</li>
                        <li>Our support team will contact you if any additional information is needed</li>
                    </ul>
                </div>
                
                <p>If you have any questions or need to update your information, please don't hesitate to contact our admissions office at <a href="mailto:${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}">${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}</a> or call us at <strong>+254 748 090 462</strong>.</p>
                
                <p>We're excited to have you join our community of learners!</p>
                
                <p style="margin-top: 30px;">
                    <strong>Best regards,</strong><br>
                    <span class="highlight">The EduPlatform Admissions Team</span>
                </p>
            </div>
            
            <div class="footer">
                <p><strong>EduPlatform - Empowering Your Future</strong></p>
                <p>📧 Email: <a href="mailto:${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}">${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}</a> | 📞 Phone: +254 748 090 462</p>
                <p style="margin-top: 15px; font-size: 12px; color: #95a5a6;">
                    This is an automated message. Please do not reply to this email address.<br>
                    For inquiries, please contact our support team at the email address above.
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

const createAdminNotificationEmail = (student) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Enrollment Application</title>
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0; 
                padding: 0; 
                background-color: #f4f4f4; 
            }
            .container { 
                max-width: 700px; 
                margin: 0 auto; 
                background: white; 
                box-shadow: 0 0 20px rgba(0,0,0,0.1); 
            }
            .header { 
                background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); 
                color: white; 
                padding: 25px 20px; 
                text-align: center; 
            }
            .header h1 { 
                margin: 0; 
                font-size: 24px; 
                font-weight: 600; 
            }
            .content { 
                padding: 30px 20px; 
            }
            .student-info { 
                background: #f8f9fa; 
                border-left: 4px solid #e74c3c; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 0 8px 8px 0; 
            }
            .info-grid { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 15px; 
                margin-top: 15px; 
            }
            .info-item { 
                padding: 10px; 
                background: white; 
                border-radius: 6px; 
                border: 1px solid #dee2e6; 
            }
            .info-label { 
                font-weight: 600; 
                color: #495057; 
                font-size: 12px; 
                text-transform: uppercase; 
                margin-bottom: 5px; 
            }
            .info-value { 
                color: #2c3e50; 
                font-size: 14px; 
            }
            .actions { 
                background: #fff3cd; 
                border: 1px solid #ffeaa7; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 25px 0; 
                text-align: center; 
            }
            .btn { 
                display: inline-block; 
                padding: 12px 24px; 
                margin: 5px 10px; 
                text-decoration: none; 
                border-radius: 6px; 
                font-weight: 600; 
                text-align: center; 
            }
            .btn-approve { 
                background: #27ae60; 
                color: white; 
            }
            .btn-review { 
                background: #3498db; 
                color: white; 
            }
            @media only screen and (max-width: 600px) {
                .info-grid { 
                    grid-template-columns: 1fr; 
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚨 New Enrollment Application</h1>
                <p style="margin: 5px 0 0 0;">Application ID: #${student._id.toString().slice(-8).toUpperCase()}</p>
            </div>
            
            <div class="content">
                <p><strong>A new student has submitted an enrollment application.</strong></p>
                
                <div class="student-info">
                    <h3 style="margin-top: 0; color: #e74c3c;">👤 Student Information</h3>
                    
                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-label">Full Name</div>
                            <div class="info-value">${student.firstName} ${student.lastName}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Email Address</div>
                            <div class="info-value">${student.email}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Phone Number</div>
                            <div class="info-value">${student.phone}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">ID Number</div>
                            <div class="info-value">${student.idnumber}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Date of Birth</div>
                            <div class="info-value">${new Date(student.dateOfBirth).toLocaleDateString()}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Course Selected</div>
                            <div class="info-value"><strong>${student.course}</strong></div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Address</div>
                            <div class="info-value">${student.address}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">City & ZIP</div>
                            <div class="info-value">${student.city}, ${student.zipCode}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Emergency Contact</div>
                            <div class="info-value">${student.emergencyContact}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Emergency Phone</div>
                            <div class="info-value">${student.emergencyPhone}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Application Date</div>
                            <div class="info-value">${new Date().toLocaleString()}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Status</div>
                            <div class="info-value">Pending Review</div>
                        </div>
                    </div>
                </div>
                
                <div class="actions">
                    <h4 style="margin-top: 0;">⚡ Quick Actions</h4>
                    <p>Review this application and take appropriate action:</p>
                    <a href="#" class="btn btn-approve">✅ Approve Application</a>
                    <a href="#" class="btn btn-review">👀 View Full Details</a>
                </div>
                
                <p><strong>Next Steps:</strong></p>
                <ul>
                    <li>Review the student's application details</li>
                    <li>Verify the provided information</li>
                    <li>Contact the student if additional information is needed</li>
                    <li>Approve or request modifications to the application</li>
                </ul>
            </div>
        </div>
    </body>
    </html>
  `;
};

// Utility Functions
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>\"']/g, '');
  }
  return input;
};

const validateEnrollmentData = (data) => {
  const errors = [];
  
  // Required fields validation
  const requiredFields = [
    'firstName', 'lastName', 'email', 'phone', 'idnumber', 
    'dateOfBirth', 'course', 'address', 'city', 'zipCode', 
    'emergencyContact', 'emergencyPhone'
  ];
  
  requiredFields.forEach(field => {
    if (!data[field] || !data[field].toString().trim()) {
      errors.push(`${field} is required`);
    }
  });
  
  // Email validation
  if (data.email && !validator.isEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  // Phone validation
  if (data.phone && !/^[\d\s\-\+\(\)]{10,}$/.test(data.phone.replace(/\s/g, ''))) {
    errors.push('Please provide a valid phone number');
  }
  
  // Emergency phone validation
  if (data.emergencyPhone && !/^[\d\s\-\+\(\)]{10,}$/.test(data.emergencyPhone.replace(/\s/g, ''))) {
    errors.push('Please provide a valid emergency phone number');
  }
  
  // Date of birth validation
  if (data.dateOfBirth) {
    const birthDate = new Date(data.dateOfBirth);
    const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 16 || age > 100) {
      errors.push('Age must be between 16 and 100 years');
    }
  }
  
  return errors;
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'EduPlatform Enrollment API is running!',
    version: '2.0.0',
    endpoints: {
      'POST /send': 'Submit enrollment application (main endpoint)',
      'POST /api/route': 'Submit enrollment application (alternative)',
      'GET /api/students': 'Get all students (admin)',
      'GET /api/students/:id': 'Get student by ID',
      'GET /health': 'Health check endpoint'
    },
    timestamp: new Date().toISOString()
  });
});

// Main enrollment endpoint - /send (matches your frontend)
app.post('/send', formLimiter, async (req, res) => {
  try {
    console.log('📝 Received enrollment data:', {
      ...req.body,
      // Don't log sensitive info
      idnumber: req.body.idnumber ? '***' + req.body.idnumber.slice(-4) : undefined
    });

    // Sanitize input data
    const sanitizedData = {};
    Object.keys(req.body).forEach(key => {
      sanitizedData[key] = sanitizeInput(req.body[key]);
    });

    // Validate input data
    const validationErrors = validateEnrollmentData(sanitizedData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Check if student already exists
    const existingStudent = await Student.findOne({
      $or: [
        { email: sanitizedData.email.toLowerCase() },
        { idnumber: sanitizedData.idnumber }
      ]
    });

    if (existingStudent) {
      const duplicateField = existingStudent.email === sanitizedData.email.toLowerCase() ? 'email' : 'ID number';
      return res.status(409).json({
        success: false,
        message: `A student with this ${duplicateField} already exists`,
        code: 'DUPLICATE_ENTRY'
      });
    }

    // Prepare student data
    const studentData = {
      firstName: sanitizedData.firstName,
      lastName: sanitizedData.lastName,
      email: sanitizedData.email.toLowerCase(),
      phone: sanitizedData.phone,
      idnumber: sanitizedData.idnumber,
      dateOfBirth: new Date(sanitizedData.dateOfBirth),
      course: sanitizedData.course,
      address: sanitizedData.address,
      city: sanitizedData.city,
      zipCode: sanitizedData.zipCode,
      emergencyContact: sanitizedData.emergencyContact,
      emergencyPhone: sanitizedData.emergencyPhone,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };

    // Create and save new student
    const newStudent = new Student(studentData);
    const savedStudent = await newStudent.save();

    console.log('✅ Student saved successfully:', savedStudent._id);

    // Send emails concurrently
    const emailPromises = [];
    
    try {
      const transporter = createTransporter();
      
      // Send confirmation email to student
      const studentEmailPromise = transporter.sendMail({
        from: `"EduPlatform Admissions" <${process.env.EMAIL_USER}>`,
        to: savedStudent.email,
        subject: '🎓 Enrollment Application Received - Confirmation Required',
        html: createStudentConfirmationEmail(savedStudent),
        priority: 'high'
      });
      
      emailPromises.push(studentEmailPromise);

      // Send notification email to admin
      if (process.env.ADMIN_EMAIL || process.env.EMAIL_USER) {
        const adminEmailPromise = transporter.sendMail({
          from: `"EduPlatform System" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
          subject: `🚨 New Enrollment: ${savedStudent.firstName} ${savedStudent.lastName} - ${savedStudent.course}`,
          html: createAdminNotificationEmail(savedStudent),
          priority: 'high'
        });
        
        emailPromises.push(adminEmailPromise);
      }

      // Wait for all emails to be sent
      await Promise.all(emailPromises);
      console.log('📧 All emails sent successfully');

    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      // Don't fail the entire request if email fails - log it for manual follow-up
    }

    // Success response
    res.status(201).json({
      success: true,
      message: 'Enrollment application submitted successfully! Please check your email for confirmation details.',
      data: {
        studentId: savedStudent._id,
        applicationId: savedStudent._id.toString().slice(-8).toUpperCase(),
        email: savedStudent.email,
        course: savedStudent.course,
        status: savedStudent.status,
        submissionTime: savedStudent.createdAt || new Date()
      }
    });

  } catch (error) {
    console.error('❌ Enrollment submission error:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: `A student with this ${field} already exists`,
        code: 'DUPLICATE_ENTRY'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Alternative endpoint (backward compatibility)
app.post('/api/route', (req, res, next) => {
  // Redirect to main endpoint
  req.url = '/send';
  next();
}, formLimiter, async (req, res) => {
  // This will be handled by the /send route above
});

// Get all students (admin endpoint)
app.get('/api/students', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const query = {};
    
    // Add filters
    if (req.query.course) {
      query.course = req.query.course;
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { course: searchRegex }
      ];
    }

    const students = await Student.find(query)
      .select('-__v') // Exclude version field
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Student.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        students,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student data'
    });
  }
});

// Get student by ID
app.get('/api/students/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const student = await Student.findById(req.params.id).select('-__v');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    res.json({
      success: true,
      data: { student }
    });
  } catch (error) {
    console.error('❌ Error fetching student:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student data'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(healthCheck);
});

// Test email endpoint (for development)
app.post('/test-email', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Test endpoint not available in production'
    });
  }

  try {
    const transporter = createTransporter();
    
    await transporter.sendMail({
      from: `"EduPlatform Test" <${process.env.EMAIL_USER}>`,
      to: req.body.email || process.env.EMAIL_USER,
      subject: 'Test Email from EduPlatform',
      html: '<h1>Test Email</h1><p>If you receive this, your email configuration is working correctly!</p>'
    });

    res.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found`,
    availableEndpoints: ['/send', '/api/route', '/api/students', '/health']
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  
  try {
    await mongoose.connection.close();
    console.log('📝 MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`📡 API available at: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📧 Main endpoint: http://localhost:${PORT}/send`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});