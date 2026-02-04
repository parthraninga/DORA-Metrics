import * as yup from 'yup';

import { handleRequest } from '@/api-helpers/axios';
import { Endpoint, nullSchema } from '@/api-helpers/global';
import {
  TeamIncidentPRsSettingApiResponse,
  TeamIncidentPRsSettingsResponse
} from '@/types/resources';

const pathSchema = yup.object().shape({
  team_id: yup.string().uuid().required()
});

const putSchema = yup.object().shape({
  setting: yup.object().shape({
    include_revert_prs: yup.boolean(),
    filters: yup.array(
      yup.object({
        field: yup.string().required(),
        value: yup.string().required()
      })
    )
  })
});

const endpoint = new Endpoint(pathSchema);

const defaultIncidentPRsSetting: TeamIncidentPRsSettingsResponse = {
  setting: { include_revert_prs: false, filters: [] }
};

endpoint.handle.GET(nullSchema, async (req, res) => {
  const { team_id } = req.payload;
  try {
    const { setting } = await handleRequest<TeamIncidentPRsSettingApiResponse>(
      `/teams/${team_id}/settings`,
      {
        method: 'GET',
        params: {
          setting_type: 'INCIDENT_PRS_SETTING'
        }
      }
    );
    return res.send({ setting } as TeamIncidentPRsSettingsResponse);
  } catch {
    return res.send(defaultIncidentPRsSetting);
  }
});

endpoint.handle.PUT(putSchema, async (req, res) => {
  const { team_id, setting } = req.payload;
  try {
    const response = await handleRequest<TeamIncidentPRsSettingApiResponse>(
      `/teams/${team_id}/settings`,
      {
        method: 'PUT',
        data: {
          setting_type: 'INCIDENT_PRS_SETTING',
          setting_data: setting
        }
      }
    );
    return res.send({
      setting: response.setting
    } as TeamIncidentPRsSettingsResponse);
  } catch {
    return res.send({ setting });
  }
});

export default endpoint.serve();
