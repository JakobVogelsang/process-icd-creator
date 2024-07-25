type ChildDiff = {
  name: string;
  element?: Element;
  type?: Element;
  class?: string;
  children: ChildDiff[];
  different: boolean;
  diffType?: 'missing' | 'different';
};

type Diff = {
  dos: ChildDiff[];
  different: boolean;
};

function dataTypeTag(data: Element): string {
  if (data.tagName === 'SDO' || data.tagName === 'DO') return 'DOType';
  if (data.tagName === 'DA' || data.tagName === 'BDA') {
    if (data.getAttribute('bType') === 'Struct') return 'DAType';
    if (data.getAttribute('bType') === 'Enum') return 'EnumType';
  }

  return 'undefined';
}

export function getDatType(data: Element): Element | null {
  return data.ownerDocument.querySelector(
    `${dataTypeTag(data)}[id="${data.getAttribute('type')}"]`
  );
}

function compareDataTypeChild(ours: Element, theirs: Element): ChildDiff {
  const oursName = ours.getAttribute('name')!;
  // const theirsName = ours.getAttribute('name')!;

  const childDiff: ChildDiff = {
    name: oursName,
    children: [],
    different: false,
  };

  const oursDataType = getDatType(ours);
  const theirsDataType = getDatType(theirs);

  if (!oursDataType && !theirsDataType) return childDiff;
  if (oursDataType && !theirsDataType) {
    childDiff.different = true;
    return childDiff;
  }
  if (!oursDataType && theirsDataType) {
    childDiff.different = true;
    return childDiff;
  }

  const children: ChildDiff[] = [];

  Array.from(
    oursDataType!.querySelectorAll(':scope > SDO, :scope > DA, :scope > BDA')
  ).forEach(oursData => {
    const oursDataName = oursData.getAttribute('name');
    const theirsData = theirsDataType!.querySelector(
      `:scope > SDO[name="${oursDataName}"],:scope > DA[name="${oursDataName}"],:scope > BDA[name="${oursDataName}"]`
    );
    const theirsDataName = theirsData?.getAttribute('name');

    if (!theirsDataName) {
      children.push({
        name: oursDataName ?? 'Undefined',
        children: [],
        different: true,
        diffType: 'missing',
      });
      childDiff.different = true;
      childDiff.diffType = 'different';
    } else if (theirsDataName === oursDataName) {
      const diff = compareDataTypeChild(oursData, theirsData!);
      if (diff.different) childDiff.different = true;
      children.push(compareDataTypeChild(oursData, theirsData!));
    }
  });

  childDiff.children = children;

  return childDiff;
}

export function compareLNodeType(ours: Element, theirs: Element): Diff {
  const dos: ChildDiff[] = [];

  let different = false;
  Array.from(ours.querySelectorAll(':scope > DO')).forEach(oursDo => {
    const oursDoName = oursDo.getAttribute('name');
    const theirsDo = theirs.querySelector(`:scope > DO[name="${oursDoName}"]`);
    const theirsDoName = theirsDo?.getAttribute('name');

    let childDiff: ChildDiff = { name: '', children: [], different: false };
    if (!theirsDoName) {
      childDiff = {
        name: oursDoName ?? 'Undefined',
        children: [],
        different: true,
        diffType: 'missing',
      };
      different = true;
    } else if (theirsDoName === oursDoName) {
      childDiff = compareDataTypeChild(oursDo, theirsDo!);
      if (childDiff.different) different = true;
    }

    const oursDataType = getDatType(oursDo);
    if (oursDataType) childDiff.class = oursDataType.getAttribute('cdc')!;

    dos.push(childDiff);
  });

  return { dos, different };
}
