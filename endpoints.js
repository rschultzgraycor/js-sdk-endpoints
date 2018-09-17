// Modifying to add graphql schema and resolvers
const { kebabCase, camelCase, filter } = require('lodash');
const fetch = require('isomorphic-fetch');
const R = require('ramda');
const fs = require('fs');
const path = require('path');
const Progress = require('progress');
const pascalCase = require('to-pascal-case');
const Handlebars = require('handlebars');
const createEndpointSchema = require('./graphql');

const ENDOINTS_URL ='http://procore-api-documentation-staging.s3-website-us-east-1.amazonaws.com';

const notEmpty = R.compose(
  R.not,
  R.isEmpty
);

const endpointTemplatePath = path.join(
  __dirname,
  'endpoint.template'
);

const requiredField = R.ifElse(
  R.identity,
  () => '',
  () => '?'
);

const typescriptType = type => {
  switch(type) {
    case 'integer':
      return 'number';
    default:
      return type;
  }
}

Handlebars.registerHelper(
  'interface',
  R.reduce(
    (memo, { name, required, type }) =>
      memo.concat(`${name}${requiredField(required)}: ${typescriptType(type)};\n`),
    ''
  )
);

Handlebars.registerHelper(
  'args',
  R.ifElse(
    R.isEmpty,
    R.identity,
    R.compose(
      R.join(', '),
      R.pluck('name')
    )
  )
);

const endpointCommand = (to, { destination, index, graphql }) => {
  console.log('graphql:',graphql);
  return fetch(`${ENDOINTS_URL}/master/groups.json`)
    .then((res) => {
      return res.json().catch((err) => {
        err.endpoint = endpointName;
        err.reason = 'parsing JSON';

        throw err;
      });
    })
    .then(groups => filter(groups, { highest_support_level: 'production' }))
    .then((groups) => {
      const bar = new Progress(':bar :percent', { total: groups.length });

      const libPath = path.join(process.cwd(), to);

      const libIndexPath = path.join(libPath, index);

      const endpointsFolderPath = path.join(libPath, destination);

      const graphqlSchemaPath = path.join(libPath, 'schema.js');

      //const graphqlResolversPath = path.join(libPath, 'resolvers.js');
      if (!fs.existsSync(endpointsFolderPath)) {
        fs.mkdirSync(endpointsFolderPath);
      }

      if (graphql) {
        fs.appendFileSync(graphqlSchemaPath, 'import { mergeSchemas } from \'graphql-tools\'\n');
        fs.appendFileSync(graphqlSchemaPath, 'import graphqlHTTP from \'express-graphql\'\n');
      }
      return Promise.all(
        groups.map(({ name }) => {
          const endpointName = name.toLowerCase();
          const gelatoGroup = kebabCase(endpointName);
          const data = fs.readFileSync(endpointTemplatePath, 'utf8');
          return fetch(`${ENDOINTS_URL}/master/${gelatoGroup}.json`)
            .then((res) => res.json())
            .then(groups => filter(groups, { support_level: 'production', }))
            .then(grp => {
              const [{ path: endpointPath, path_params, query_params }] = grp;

              const camelizedEndpointName = camelCase(endpointName);

              const pascalCaseEndpointName = pascalCase(endpointName);

              const params = R.when(
                R.compose(
                  R.not,
                  R.contains('id'),
                  R.pluck('name')
                ),
                R.concat([{ name: "id", type: "integer" }])
              )(path_params);

              const config = {
                params,
                name: camelizedEndpointName,
                interfaceName: pascalCaseEndpointName,
                definitions: params,
                path: endpointPath
              };

              template = Handlebars.compile(data)

              file = template(config);

              fs.writeFileSync(path.join(endpointsFolderPath, `${gelatoGroup}.ts`), file);
              fs.appendFileSync(libIndexPath, `export { default as ${camelizedEndpointName} } from './${destination}/${gelatoGroup}'\n`);

              const schema = createEndpointSchema(libPath, destination, gelatoGroup, grp);

              bar.tick();

              return schema;
          })
          .catch((err) => {
            err.preName = name;
            err.endpoint = endpointName;
            err.reason = 'Fetch';

            throw err;
          });
        })
      )
      .then(results => {
        let schemas = '';
        results.map(schema => {
          fs.appendFileSync(graphqlSchemaPath, `${schema.import}\n`);
          schemas += `\n\t\t\tawait ${schema.name}(),`;
        })
        fs.appendFileSync(graphqlSchemaPath, `const grayql = graphqlHTTP(async request => ({\n\tschema: mergeSchemas({\n\t\tschemas: [${schemas}\n\t\t]\n\t}),\n\tgraphiql: true,\n\trootValue: request.body,\n\tformatError: error => ({\n\tmessage: error.message,\n\t\tlocations: error.locations,\n\t\tstack: error.stack ? error.stack.split('\\n') : [],\n\t\tpath: error.path,\n\t}),\n}));\n\nexport default grayql;`);
      })
      .catch((err) => {
        if (err.endpoint && err.reason) {
          console.error(`Failed to fetch and parse JSON for endpoint: ${err.endpoint} (${err.preName}) failed at step: ${err.reason}`);
        }

        throw err;
      })
    })
}

module.exports= endpointCommand;
