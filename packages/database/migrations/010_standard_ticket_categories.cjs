const CATEGORIES = [
  [
    '10000000-0000-4000-8000-000000000001',
    'Hardware',
    [
      'Desktop or Laptop',
      'Printer or Scanner',
      'Peripheral',
      'Server or Storage',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000002',
    'Software',
    [
      'Application Issue',
      'Installation or Upgrade',
      'Licensing',
      'Operating System',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000003',
    'Microsoft 365',
    [
      'Outlook or Email',
      'Microsoft Teams',
      'SharePoint or OneDrive',
      'Office Applications',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000004',
    'Identity and Access',
    [
      'Password Reset',
      'Account Lockout',
      'Multi-Factor Authentication',
      'Permissions or Access',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000005',
    'Network and Connectivity',
    ['LAN or Wi-Fi', 'VPN', 'Internet', 'DNS or DHCP'],
  ],
  [
    '10000000-0000-4000-8000-000000000006',
    'Infrastructure',
    [
      'Windows Server',
      'Active Directory',
      'Hyper-V or Virtual Machine',
      'Backup or Veeam',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000007',
    'Security',
    ['Phishing or Spam', 'Endpoint Security', 'Firewall', 'Security Incident'],
  ],
  [
    '10000000-0000-4000-8000-000000000008',
    'Other',
    ['General Support', 'Service Request', 'Other Issue'],
  ],
  [
    '10000000-0000-4000-8000-000000000009',
    'Windows and Operating System',
    [
      'Windows Login',
      'User Profile',
      'Startup or Boot',
      'Windows Update',
      'Driver Issue',
      'System Crash',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000010',
    'Printing and Scanning',
    [
      'Printer Offline',
      'Print Queue',
      'Printer Driver',
      'Scanning Issue',
      'Print Quality',
      'Network Printer',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000011',
    'File and Data Services',
    [
      'Shared Folder',
      'File Permissions',
      'Deleted File Recovery',
      'Storage Quota',
      'Data Transfer',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000012',
    'Business Applications',
    [
      'ERP or CRM',
      'Accounting Application',
      'HR or Payroll',
      'Database Access',
      'Custom Application',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000013',
    'User Lifecycle',
    [
      'New User Onboarding',
      'User Offboarding',
      'Department Transfer',
      'Equipment Allocation',
      'Access Removal',
    ],
  ],
  [
    '10000000-0000-4000-8000-000000000014',
    'Mobile and Telephony',
    [
      'Mobile Device',
      'VoIP or Extension',
      'Softphone',
      'Calling Issue',
      'Mobile Connectivity',
    ],
  ],
];

exports.up = async function (db) {
  let childNumber = 1;
  for (const [rootId, rootName, children] of CATEGORIES) {
    const existingRoot = await db('categories')
      .whereNull('parent_id')
      .whereRaw('lower(name)=lower(?)', [rootName])
      .first('id');
    const parentId = existingRoot?.id ?? rootId;
    if (!existingRoot) {
      await db('categories').insert({
        id: rootId,
        name: rootName,
        description: `${rootName} support requests`,
      });
    }
    for (const childName of children) {
      const childId = `20000000-0000-4000-8000-${String(childNumber).padStart(12, '0')}`;
      childNumber += 1;
      const existingChild = await db('categories')
        .where({ parent_id: parentId })
        .whereRaw('lower(name)=lower(?)', [childName])
        .first('id');
      if (!existingChild) {
        await db('categories').insert({
          id: childId,
          parent_id: parentId,
          name: childName,
          description: `${childName} tickets`,
        });
      }
    }
  }
  await db('app_schema_state').where({ id: 1 }).update({ version: 10 });
};

exports.down = async function (db) {
  await db('categories')
    .whereIn(
      'id',
      Array.from(
        { length: CATEGORIES.reduce((sum, item) => sum + item[2].length, 0) },
        (_, index) =>
          `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ),
    )
    .whereNotExists(function () {
      this.select(db.raw('1'))
        .from('tickets')
        .whereRaw('tickets.category_id=categories.id');
    })
    .delete();
  await db('categories')
    .whereIn(
      'id',
      CATEGORIES.map(([id]) => id),
    )
    .whereNotExists(function () {
      this.select(db.raw('1'))
        .from('categories as children')
        .whereRaw('children.parent_id=categories.id');
    })
    .delete();
  await db('app_schema_state').where({ id: 1 }).update({ version: 9 });
};
