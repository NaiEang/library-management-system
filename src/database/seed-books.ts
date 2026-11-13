import { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';

interface BookSeedItem {
  title: string;
  cat: string;
  auth: string;
  type: 'book' | 'limited_edition' | 'research_paper';
  publisher: string;
  publishedDate: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Book copies
// ---------------------------------------------------------------------------

const CONDITION_CYCLE = ['new', 'new', 'good', 'good', 'fair'];

const SHELF_BY_CATEGORY: Record<string, string> = {
  Fantasy: 'Shelf A',
  'Science Fiction': 'Shelf B',
  'Computer Science': 'Shelf C',
  History: 'Shelf D',
  Philosophy: 'Shelf E',
  Mathematics: 'Shelf F',
  Physics: 'Shelf F',
  Psychology: 'Shelf G',
};

// Creates realistic copies for one book:
//  - 3 copies per normal book (every third book gets 4), 2 for limited editions and research papers
//  - varied conditions and shelf locations, a few damaged / lost copies
//  - the first copy of every book is always available, so every book stays borrowable
//  - never creates "borrowed" copies: that status comes from the real borrowing flow
//  - safe to run again: it only touches copies this seed created (CP- / TMP- codes)
//    and never touches a copy that has borrowing history
async function seedCopies(
  db: DataSource,
  bookId: string,
  index: number,
  type: string,
  category: string,
) {
  const target = type === 'book' ? (index % 3 === 0 ? 4 : 3) : 2;

  const countRows = await db.query(
    `SELECT COUNT(*)::int AS count FROM book_copies WHERE book_id = $1`,
    [bookId],
  );
  const existingCount: number = countRows[0].count;

  if (existingCount < target) {
    await db.query(
      `INSERT INTO book_copies (book_id, copy_code, status, "condition")
       SELECT $1, 'TMP-' || gen_random_uuid()::text, 'available', 'new'
       FROM generate_series(1, $2::int)`,
      [bookId, target - existingCount],
    );
  }

  const copies = await db.query(
    `SELECT id, copy_code FROM book_copies WHERE book_id = $1 ORDER BY id`,
    [bookId],
  );

  for (let j = 0; j < copies.length; j++) {
    const copy = copies[j];

    // Only touch copies this seed created. Copies added through the app are left alone.
    const seedManaged = copy.copy_code.startsWith('CP-') || copy.copy_code.startsWith('TMP-');
    if (!seedManaged) continue;

    // Never touch a copy that has borrowing history.
    const used = await db.query(`SELECT 1 FROM loan_items WHERE book_copy_id = $1 LIMIT 1`, [
      copy.id,
    ]);
    if (used.length > 0) continue;

    const seq = index * 7 + j * 3;
    let status = 'available';
    let condition = CONDITION_CYCLE[(index + j) % CONDITION_CYCLE.length];
    if (j > 0 && seq % 23 === 0) {
      status = 'damaged';
      condition = 'damaged';
    } else if (j > 0 && seq % 29 === 0) {
      status = 'lost';
      condition = 'poor';
    } else if (j > 0 && seq % 11 === 0) {
      condition = 'poor';
    }

    const location =
      type === 'limited_edition'
        ? 'Rare Books Cabinet'
        : type === 'research_paper'
          ? 'Research Archive'
          : `${SHELF_BY_CATEGORY[category] ?? 'Shelf Z'}${(index % 4) + 1}`;

    await db.query(
      `UPDATE book_copies
       SET copy_code = $1, "condition" = $2, status = $3, location = $4
       WHERE id = $5`,
      [`LIB-${String(copy.id).padStart(6, '0')}`, condition, status, location, copy.id],
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function bootstrap() {
  await AppDataSource.initialize();
  const dataSource = AppDataSource;

  console.log('🌱 Seeding books, authors, categories and book copies...');

  const categoriesData = [
    'Fantasy',
    'Science Fiction',
    'Computer Science',
    'History',
    'Philosophy',
    'Mathematics',
    'Physics',
    'Psychology',
  ];
  const categoryIds: { [name: string]: number } = {};
  for (const catName of categoriesData) {
    const result = await dataSource.query(
      `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id;`,
      [catName],
    );
    categoryIds[catName] =
      result[0]?.id ||
      (await dataSource.query(`SELECT id FROM categories WHERE name = $1`, [catName]))[0].id;
  }

  const authorsData = [
    'J. K. Rowling',
    'J. R. R. Tolkien',
    'Isaac Asimov',
    'Arthur C. Clarke',
    'Robert C. Martin',
    'Martin Fowler',
    'Yuval Noah Harari',
    'Plato',
    'Agatha Christie',
    'Stephen Hawking',
    'Carl Sagan',
    'Bjarne Stroustrup',
    'Andrew Hunt',
    'David Thomas',
    'Erich Gamma',
    'Kent Beck',
  ];
  const authorIds: { [name: string]: number } = {};
  for (const authorName of authorsData) {
    const existingAuthor = await dataSource.query(
      `SELECT id FROM authors WHERE name = $1 LIMIT 1`,
      [authorName],
    );
    if (existingAuthor.length > 0) {
      authorIds[authorName] = existingAuthor[0].id;
    } else {
      const result = await dataSource.query(`INSERT INTO authors (name) VALUES ($1) RETURNING id;`, [
        authorName,
      ]);
      authorIds[authorName] = result[0].id;
    }
  }

  const baseBooks: BookSeedItem[] = [
    {
      title: "Harry Potter and the Philosopher's Stone",
      cat: 'Fantasy',
      auth: 'J. K. Rowling',
      type: 'book',
      publisher: 'Bloomsbury',
      publishedDate: '1997-06-26',
      description:
        'A young wizard discovers his magical heritage on his eleventh birthday and attends Hogwarts School of Witchcraft and Wizardry.',
    },
    {
      title: 'Harry Potter and the Chamber of Secrets',
      cat: 'Fantasy',
      auth: 'J. K. Rowling',
      type: 'book',
      publisher: 'Bloomsbury',
      publishedDate: '1998-07-02',
      description:
        'Harry returns for his second year at Hogwarts, where mysterious attacks petrify students and rumors of a hidden chamber spread.',
    },
    {
      title: 'Harry Potter and the Prisoner of Azkaban',
      cat: 'Fantasy',
      auth: 'J. K. Rowling',
      type: 'book',
      publisher: 'Bloomsbury',
      publishedDate: '1999-07-08',
      description:
        'Harry learns about Sirius Black, an escaped convict from Azkaban prison who is allegedly pursuing him.',
    },
    {
      title: 'Harry Potter and the Goblet of Fire',
      cat: 'Fantasy',
      auth: 'J. K. Rowling',
      type: 'limited_edition',
      publisher: 'Bloomsbury',
      publishedDate: '2000-07-08',
      description:
        'A deluxe collector edition covering Harry competing in the perilous Triwizard Tournament amidst rising dark forces.',
    },
    {
      title: "The Hobbit (Collector's Edition)",
      cat: 'Fantasy',
      auth: 'J. R. R. Tolkien',
      type: 'limited_edition',
      publisher: 'George Allen & Unwin',
      publishedDate: '1937-09-21',
      description:
        'A deluxe edition detailing the journey of home-loving hobbit Bilbo Baggins to reclaim the Lonely Mountain and its treasure.',
    },
    {
      title: 'The Hobbit',
      cat: 'Fantasy',
      auth: 'J. R. R. Tolkien',
      type: 'book',
      publisher: 'George Allen & Unwin',
      publishedDate: '1937-09-21',
      description:
        'Bilbo Baggins, a home-loving hobbit, is swept into an epic quest by Gandalf and thirteen dwarves to reclaim the Lonely Mountain.',
    },
    {
      title: 'The Fellowship of the Ring',
      cat: 'Fantasy',
      auth: 'J. R. R. Tolkien',
      type: 'book',
      publisher: 'George Allen & Unwin',
      publishedDate: '1954-07-29',
      description:
        'The first volume of The Lord of the Rings, following Frodo Baggins as he embarks on an epic quest to destroy the One Ring.',
    },
    {
      title: 'The Two Towers',
      cat: 'Fantasy',
      auth: 'J. R. R. Tolkien',
      type: 'book',
      publisher: 'George Allen & Unwin',
      publishedDate: '1954-11-11',
      description:
        "The Fellowship is fractured across Middle-earth as war looms at Helm's Deep and Frodo treks toward Mordor.",
    },
    {
      title: 'The Return of the King',
      cat: 'Fantasy',
      auth: 'J. R. R. Tolkien',
      type: 'book',
      publisher: 'George Allen & Unwin',
      publishedDate: '1955-10-20',
      description:
        'The climax of the quest to destroy the One Ring, leading to the final battle for Middle-earth and the restoration of the king.',
    },
    {
      title: 'Foundation',
      cat: 'Science Fiction',
      auth: 'Isaac Asimov',
      type: 'book',
      publisher: 'Gnome Press',
      publishedDate: '1951-05-01',
      description:
        'Psychohistorian Hari Seldon foresees the fall of the Galactic Empire and creates the Foundation to preserve human civilization.',
    },
    {
      title: 'Foundation and Empire',
      cat: 'Science Fiction',
      auth: 'Isaac Asimov',
      type: 'book',
      publisher: 'Gnome Press',
      publishedDate: '1952-09-01',
      description:
        'The Foundation faces both the military remnants of the Empire and the mysterious mutant conqueror known as the Mule.',
    },
    {
      title: 'Second Foundation',
      cat: 'Science Fiction',
      auth: 'Isaac Asimov',
      type: 'book',
      publisher: 'Gnome Press',
      publishedDate: '1953-01-01',
      description:
        'The search for the elusive Second Foundation intensifies as the galaxy seeks mental equilibrium and stability.',
    },
    {
      title: 'I, Robot',
      cat: 'Science Fiction',
      auth: 'Isaac Asimov',
      type: 'book',
      publisher: 'Gnome Press',
      publishedDate: '1950-12-02',
      description:
        'A collection of interconnected short stories establishing the Three Laws of Robotics and exploring their ethical consequences.',
    },
    {
      title: '2001: A Space Odyssey',
      cat: 'Science Fiction',
      auth: 'Arthur C. Clarke',
      type: 'book',
      publisher: 'New American Library',
      publishedDate: '1968-07-01',
      description:
        'An enigmatic alien monolith prompts a voyage to Saturn guided by the sentient and increasingly erratic computer HAL 9000.',
    },
    {
      title: 'Rendezvous with Rama',
      cat: 'Science Fiction',
      auth: 'Arthur C. Clarke',
      type: 'book',
      publisher: 'Victor Gollancz',
      publishedDate: '1973-06-01',
      description:
        'Human astronauts explore a gigantic, cylindrical alien starship that enters the solar system without explanation.',
    },
    {
      title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
      cat: 'Computer Science',
      auth: 'Robert C. Martin',
      type: 'book',
      publisher: 'Prentice Hall',
      publishedDate: '2008-08-01',
      description:
        'Practical principles and patterns for writing readable, maintainable, and robust object-oriented software.',
    },
    {
      title: 'Clean Architecture',
      cat: 'Computer Science',
      auth: 'Robert C. Martin',
      type: 'limited_edition',
      publisher: 'Prentice Hall',
      publishedDate: '2017-09-17',
      description:
        'Collector edition on software structure and design rules to build systems that withstand change and scale effectively.',
    },
    {
      title: 'Refactoring: Improving the Design of Existing Code',
      cat: 'Computer Science',
      auth: 'Martin Fowler',
      type: 'limited_edition',
      publisher: 'Addison-Wesley',
      publishedDate: '1999-07-08',
      description:
        'Seminal guide on transforming legacy and cluttered codebases into clean architecture without changing external behavior.',
    },
    {
      title: 'Patterns of Enterprise Application Architecture',
      cat: 'Computer Science',
      auth: 'Martin Fowler',
      type: 'book',
      publisher: 'Addison-Wesley',
      publishedDate: '2002-11-05',
      description:
        'A comprehensive catalog of architectural patterns for enterprise systems, covering domain logic, data mapping, and session state.',
    },
    {
      title: 'The Pragmatic Programmer',
      cat: 'Computer Science',
      auth: 'Andrew Hunt',
      type: 'book',
      publisher: 'Addison-Wesley',
      publishedDate: '1999-10-20',
      description:
        'Timeless guidance and pragmatic philosophy for software developers seeking mastery of their craft.',
    },
    {
      title: 'Design Patterns',
      cat: 'Computer Science',
      auth: 'Erich Gamma',
      type: 'limited_edition',
      publisher: 'Addison-Wesley',
      publishedDate: '1994-10-21',
      description:
        'The definitive Gang of Four catalog of 23 foundational object-oriented design patterns.',
    },
    {
      title: 'Test-Driven Development by Example',
      cat: 'Computer Science',
      auth: 'Kent Beck',
      type: 'book',
      publisher: 'Addison-Wesley',
      publishedDate: '2002-11-08',
      description:
        'A guide to writing clean code guided by tests, demonstrating red-green-refactor workflows through practical examples.',
    },
    {
      title: 'The C++ Programming Language',
      cat: 'Computer Science',
      auth: 'Bjarne Stroustrup',
      type: 'book',
      publisher: 'Addison-Wesley',
      publishedDate: '1985-10-14',
      description:
        'The authoritative reference work written by the creator of C++, covering language idioms, memory management, and abstraction.',
    },
    {
      title: 'Sapiens: A Brief History of Humankind',
      cat: 'History',
      auth: 'Yuval Noah Harari',
      type: 'book',
      publisher: 'Harvill Secker',
      publishedDate: '2014-09-04',
      description:
        'An exploration of human history from the emergence of Homo sapiens in the Stone Age to modern global empires.',
    },
    {
      title: 'Homo Deus: A Brief History of Tomorrow',
      cat: 'History',
      auth: 'Yuval Noah Harari',
      type: 'book',
      publisher: 'Harvill Secker',
      publishedDate: '2016-09-08',
      description:
        'An inquiry into the future of humanity, examining technological convergence, artificial intelligence, and bioengineering.',
    },
    {
      title: '21 Lessons for the 21st Century',
      cat: 'History',
      auth: 'Yuval Noah Harari',
      type: 'book',
      publisher: 'Spiegel & Grau',
      publishedDate: '2018-09-04',
      description:
        'A probing look at present-day challenges, including disinformation, technological disruptions, nationalism, and climate change.',
    },
    {
      title: 'The Republic',
      cat: 'Philosophy',
      auth: 'Plato',
      type: 'book',
      publisher: 'Penguin Classics',
      publishedDate: '1955-01-01',
      description:
        'Socratic dialogue on justice, the order and character of the just city-state, and the nature of the philosopher king.',
    },
    {
      title: 'Symposium',
      cat: 'Philosophy',
      auth: 'Plato',
      type: 'book',
      publisher: "Oxford World's Classics",
      publishedDate: '1994-06-23',
      description:
        'A dramatic philosophical dialogue on the nature and origin of love delivered by Athenian luminaries at a banquet.',
    },
    {
      title: 'And Then There Were None',
      cat: 'Fantasy',
      auth: 'Agatha Christie',
      type: 'book',
      publisher: 'Collins Crime Club',
      publishedDate: '1939-11-06',
      description:
        'Ten strangers are lured to an isolated island mansion where they are systematically accused of crimes and murdered.',
    },
    {
      title: 'Murder on the Orient Express',
      cat: 'Fantasy',
      auth: 'Agatha Christie',
      type: 'book',
      publisher: 'Collins Crime Club',
      publishedDate: '1934-01-01',
      description:
        'Detective Hercule Poirot investigates the murder of an American passenger aboard the snowbound Orient Express.',
    },
    {
      title: 'The Murder of Roger Ackroyd',
      cat: 'Fantasy',
      auth: 'Agatha Christie',
      type: 'book',
      publisher: 'Collins Crime Club',
      publishedDate: '1926-06-01',
      description:
        'Poirot investigates a murder in an English village featuring an iconic and genre-defining narrative twist.',
    },
    {
      title: 'A Brief History of Time',
      cat: 'Physics',
      auth: 'Stephen Hawking',
      type: 'limited_edition',
      publisher: 'Bantam Books',
      publishedDate: '1988-04-01',
      description:
        'Collector edition explaining cosmological phenomena, the Big Bang, black holes, and the search for a unified theory.',
    },
    {
      title: 'The Universe in a Nutshell',
      cat: 'Physics',
      auth: 'Stephen Hawking',
      type: 'book',
      publisher: 'Bantam Books',
      publishedDate: '2001-11-06',
      description:
        'An illustrated exploration of modern theoretical physics, quantum mechanics, superstring theory, and p-branes.',
    },
    {
      title: 'Cosmos',
      cat: 'Physics',
      auth: 'Carl Sagan',
      type: 'book',
      publisher: 'Random House',
      publishedDate: '1980-10-12',
      description:
        "A grand narrative of cosmic evolution, science history, and humanity's place in the broader universe.",
    },
    {
      title: 'Pale Blue Dot',
      cat: 'Physics',
      auth: 'Carl Sagan',
      type: 'book',
      publisher: 'Random House',
      publishedDate: '1994-11-01',
      description:
        'Inspirational reflection on our vulnerable planet as seen from the outer edges of the solar system.',
    },
    {
      title: 'Advanced Distributed Systems Research',
      cat: 'Computer Science',
      auth: 'Martin Fowler',
      type: 'research_paper',
      publisher: 'IEEE Computer Society',
      publishedDate: '2021-03-15',
      description:
        'Peer-reviewed study examining consensus algorithms, state machine replication, and partitioning in distributed datastores.',
    },
    {
      title: 'Machine Learning Paradigms in Quantum Computing',
      cat: 'Computer Science',
      auth: 'Stephen Hawking',
      type: 'research_paper',
      publisher: 'Nature Publishing Group',
      publishedDate: '2022-07-20',
      description:
        'Theoretical analysis of variational quantum eigensolvers combined with reinforcement learning for molecule simulation.',
    },
    {
      title: 'Socio-Economic Impacts of AI on Modern Libraries',
      cat: 'History',
      auth: 'Yuval Noah Harari',
      type: 'research_paper',
      publisher: 'Oxford Academic Press',
      publishedDate: '2023-01-18',
      description:
        'An empirical assessment of automated cataloging, AI recommendation engines, and digital archiving on library patronage.',
    },
    {
      title: 'Refactoring Legacy Code Strategies',
      cat: 'Computer Science',
      auth: 'Robert C. Martin',
      type: 'research_paper',
      publisher: 'ACM Transactions on Software Engineering',
      publishedDate: '2020-05-11',
      description:
        'A systematic review of automated dependency extraction and safe refactoring practices in mission-critical codebases.',
    },
    {
      title: 'Astrophysical Implications of Event Horizons',
      cat: 'Physics',
      auth: 'Carl Sagan',
      type: 'research_paper',
      publisher: 'Cambridge University Press',
      publishedDate: '2019-11-04',
      description:
        'Observation and modeling of photon spheres and gravitational lensing near supermassive galactic cores.',
    },
    {
      title: 'Epistemological Structures in Ancient Philosophy',
      cat: 'Philosophy',
      auth: 'Plato',
      type: 'research_paper',
      publisher: 'Harvard University Press',
      publishedDate: '2020-09-14',
      description:
        'A critical re-examination of Platonic forms and Socratic inquiry in contemporary epistemology.',
    },
    {
      title: 'Database Normalization Scale Limits',
      cat: 'Computer Science',
      auth: 'Martin Fowler',
      type: 'research_paper',
      publisher: 'ACM SIGMOD Record',
      publishedDate: '2022-04-05',
      description:
        'Investigating trade-offs between 3NF normalization, columnar indexing, and eventual consistency at petabyte scale.',
    },
    {
      title: 'Algorithmic Efficiency in Distributed Ledgers',
      cat: 'Computer Science',
      auth: 'Bjarne Stroustrup',
      type: 'research_paper',
      publisher: 'Springer Computing',
      publishedDate: '2021-08-30',
      description:
        'Performance benchmarks of proof-of-stake versus asynchronous Byzantine fault-tolerant protocols under high latency.',
    },
    {
      title: 'Quantum Cryptography Protocols',
      cat: 'Physics',
      auth: 'Stephen Hawking',
      type: 'research_paper',
      publisher: 'Physical Review Letters',
      publishedDate: '2023-06-12',
      description:
        'Security evaluation of quantum key distribution against side-channel photon-number splitting attacks.',
    },
    {
      title: 'Human Cognitive Bias in Software Engineering',
      cat: 'Computer Science',
      auth: 'Kent Beck',
      type: 'research_paper',
      publisher: 'IEEE Software',
      publishedDate: '2022-10-09',
      description:
        'Empirical survey on confirmation bias in code reviews and sunk-cost fallacies during architectural migrations.',
    },
    {
      title: 'The Psychology of Distributed Teams',
      cat: 'Psychology',
      auth: 'Andrew Hunt',
      type: 'research_paper',
      publisher: 'Journal of Applied Psychology',
      publishedDate: '2021-02-14',
      description:
        'Longitudinal study on remote communication fatigue, trust formation, and team resilience in software organizations.',
    },
    {
      title: 'Neural Network Architectures for Text Processing',
      cat: 'Computer Science',
      auth: 'Isaac Asimov',
      type: 'research_paper',
      publisher: 'MIT Press',
      publishedDate: '2023-03-22',
      description:
        'Comparative benchmark of multi-head self-attention mechanisms against recurrent architectures on semantic parsing.',
    },
    {
      title: 'History of Cryptography in World War II',
      cat: 'History',
      auth: 'Agatha Christie',
      type: 'research_paper',
      publisher: 'Historical Journal of Cryptology',
      publishedDate: '2019-08-17',
      description:
        'Archival analysis of mechanical rotor cipher machines, electromechanical Bombes, and Allied signal intelligence.',
    },
    {
      title: 'Ethics of Artificial Intelligence Deployment',
      cat: 'Philosophy',
      auth: 'Yuval Noah Harari',
      type: 'research_paper',
      publisher: 'Ethics and Information Technology',
      publishedDate: '2022-12-01',
      description:
        'Normative framework for accountability, algorithmic transparency, and bias mitigation in public sector AI systems.',
    },
    {
      title: 'High-Performance Computing Benchmarks',
      cat: 'Computer Science',
      auth: 'Bjarne Stroustrup',
      type: 'research_paper',
      publisher: 'Elsevier Parallel Computing',
      publishedDate: '2023-09-10',
      description:
        'Evaluating memory bandwidth saturation and heterogeneous GPU-CPU interconnects on modern supercomputing clusters.',
    },
    {
      title: 'Comparative Analysis of Agile Frameworks',
      cat: 'Computer Science',
      auth: 'Kent Beck',
      type: 'research_paper',
      publisher: 'Journal of Systems and Software',
      publishedDate: '2020-11-25',
      description:
        'Multi-organization case study evaluating velocity, bug escape rates, and team autonomy across Scrum and Kanban.',
    },
  ];

  for (let i = 0; i < baseBooks.length; i++) {
    const b = baseBooks[i];
    const isbnNumber = b.type === 'research_paper' ? null : (9780000000000 + i + 1).toString();
    const catId = categoryIds[b.cat];
    const authId = authorIds[b.auth];

    let bookId: string;
    const existing = await dataSource.query(
      `SELECT id FROM books WHERE (isbn IS NOT NULL AND isbn = $1) OR title = $2 LIMIT 1`,
      [isbnNumber, b.title],
    );

    if (existing.length > 0) {
      bookId = existing[0].id;
      await dataSource.query(
        `UPDATE books 
         SET item_type = $1, 
             category_id = $2, 
             publisher = $3, 
             published_date = $4, 
             description = $5 
         WHERE id = $6`,
        [b.type, catId, b.publisher, b.publishedDate, b.description, bookId],
      );
    } else {
      const bookInsert = await dataSource.query(
        `INSERT INTO books (title, isbn, item_type, category_id, publisher, published_date, description) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
        [b.title, isbnNumber, b.type, catId, b.publisher, b.publishedDate, b.description],
      );
      bookId = bookInsert[0].id;
    }

    await dataSource.query(
      `INSERT INTO book_authors (book_id, author_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [bookId, authId],
    );

    await seedCopies(dataSource, bookId, i, b.type, b.cat);
  }

  const summary = await dataSource.query(
    `SELECT status, COUNT(*)::int AS count FROM book_copies GROUP BY status ORDER BY status`,
  );
  console.log(`✅ Seeded ${baseBooks.length} books with realistic copies. Copies by status:`);
  console.table(summary);

  await AppDataSource.destroy();
}

bootstrap().catch((err) => {
  console.error('Failed to seed books:', err);
  process.exit(1);
});